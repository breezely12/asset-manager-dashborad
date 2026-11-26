from __future__ import annotations

import json
import math
import os
import secrets
from datetime import date
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from . import prices
from .db import get_conn, init_db

app = FastAPI(title="Asset Manager")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

_basic = HTTPBasic(auto_error=False)


class _BasicAuthMiddleware(BaseHTTPMiddleware):
    """Gates every request behind HTTP Basic Auth, credentials from env vars.

    Set with no defaults: if DASHBOARD_USER/DASHBOARD_PASS aren't set, auth
    is skipped entirely (local-only use), so this only takes effect once the
    server is started with those env vars exported.
    """

    async def dispatch(self, request: Request, call_next):
        user = os.environ.get("DASHBOARD_USER")
        password = os.environ.get("DASHBOARD_PASS")
        if not user or not password:
            return await call_next(request)

        creds = await _basic(request)
        if creds is None or not (
            secrets.compare_digest(creds.username, user)
            and secrets.compare_digest(creds.password, password)
        ):
            return Response(
                status_code=401,
                headers={"WWW-Authenticate": "Basic realm=\"asset-manager\""},
            )
        return await call_next(request)


app.add_middleware(_BasicAuthMiddleware)

CATEGORIES = ("stock", "crypto", "cash", "realestate", "other")


@app.on_event("startup")
def _startup() -> None:
    init_db()


# ---------- schemas ----------

class HoldingIn(BaseModel):
    category: Literal["stock", "crypto", "cash", "realestate", "other"]
    name: str
    symbol: Optional[str] = None
    quantity: Optional[float] = None
    avg_cost: Optional[float] = None
    manual_value: Optional[float] = None
    currency: str = "KRW"
    note: Optional[str] = None


class TransactionIn(BaseModel):
    date: str
    type: Literal["income", "expense"]
    category: str
    amount: float
    memo: Optional[str] = None
    kind: Literal["ledger", "investment"] = "ledger"
    payment_method: Optional[str] = None
    count_in_total: bool = True


class GoalIn(BaseModel):
    age: int
    target_krw: float
    label: Optional[str] = None


class LiabilityIn(BaseModel):
    name: str
    balance_krw: float
    note: Optional[str] = None


class BirthYearIn(BaseModel):
    birth_year: int


# ---------- helpers ----------

def _to_krw(value: float, currency: str, fx: float) -> float:
    if value is None:
        return None
    if currency == "KRW":
        return value
    if currency == "USD":
        return value * fx
    return value  # unsupported currency: shown as-is, not converted


def _enrich_holding(row: dict, fx: float) -> dict:
    h = dict(row)
    category = h["category"]
    currency = h["currency"] or "KRW"
    current_price = None
    price_ok = True

    if category == "stock" and h["symbol"]:
        quote = prices.get_stock_quote(h["symbol"])
        current_price = quote.get("price")
        price_ok = quote.get("ok", False)
        if quote.get("currency"):
            currency = quote["currency"]
        value = (current_price or 0) * (h["quantity"] or 0) if current_price is not None else None
    elif category == "crypto" and h["symbol"]:
        quote = prices.get_crypto_price(h["symbol"], vs="krw")
        current_price = quote.get("price")
        price_ok = quote.get("ok", False)
        currency = "KRW"
        value = (current_price or 0) * (h["quantity"] or 0) if current_price is not None else None
    else:
        current_price = h["manual_value"]
        value = h["manual_value"]

    cost_basis = None
    if category in ("stock", "crypto") and h["avg_cost"] is not None and h["quantity"] is not None:
        cost_basis = h["avg_cost"] * h["quantity"]
    elif category in ("cash", "realestate", "other") and h["avg_cost"] is not None:
        cost_basis = h["avg_cost"]

    value_krw = _to_krw(value, currency, fx) if value is not None else None
    cost_basis_krw = _to_krw(cost_basis, currency, fx) if cost_basis is not None else None

    gain_krw = None
    gain_pct = None
    if value_krw is not None and cost_basis_krw is not None and cost_basis_krw != 0:
        gain_krw = value_krw - cost_basis_krw
        gain_pct = gain_krw / cost_basis_krw * 100

    h.update(
        current_price=current_price,
        price_ok=price_ok,
        currency=currency,
        value=value,
        value_krw=value_krw,
        cost_basis_krw=cost_basis_krw,
        gain_krw=gain_krw,
        gain_pct=gain_pct,
    )
    return h


# ---------- holdings ----------

@app.get("/api/holdings")
def list_holdings():
    fx = prices.get_usdkrw_rate()
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM holdings ORDER BY category, id")]
    return {"fx_usdkrw": fx, "holdings": [_enrich_holding(r, fx) for r in rows]}


@app.post("/api/holdings")
def create_holding(body: HoldingIn):
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO holdings
               (category, name, symbol, quantity, avg_cost, manual_value, currency, note)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                body.category, body.name, body.symbol, body.quantity,
                body.avg_cost, body.manual_value, body.currency, body.note,
            ),
        )
        return {"id": cur.lastrowid}


@app.put("/api/holdings/{holding_id}")
def update_holding(holding_id: int, body: HoldingIn):
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM holdings WHERE id = ?", (holding_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Holding not found")
        conn.execute(
            """UPDATE holdings SET category=?, name=?, symbol=?, quantity=?, avg_cost=?,
               manual_value=?, currency=?, note=?, updated_at=datetime('now') WHERE id=?""",
            (
                body.category, body.name, body.symbol, body.quantity, body.avg_cost,
                body.manual_value, body.currency, body.note, holding_id,
            ),
        )
    return {"ok": True}


@app.delete("/api/holdings/{holding_id}")
def delete_holding(holding_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM holdings WHERE id = ?", (holding_id,))
    return {"ok": True}


# ---------- lookups (for the add-holding form) ----------

@app.get("/api/lookup/stock/{symbol}")
def lookup_stock(symbol: str):
    return prices.get_stock_quote(symbol)


@app.get("/api/lookup/crypto/search")
def lookup_crypto_search(q: str):
    return prices.search_crypto(q)


# ---------- summary & snapshots ----------

@app.get("/api/summary")
def summary():
    fx = prices.get_usdkrw_rate()
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM holdings")]
    enriched = [_enrich_holding(r, fx) for r in rows]

    by_category = {c: 0.0 for c in CATEGORIES}
    total_krw = 0.0
    total_cost_krw = 0.0
    total_gain_krw = 0.0
    for h in enriched:
        v = h["value_krw"] or 0.0
        by_category[h["category"]] += v
        total_krw += v
        # Only holdings with a known cost basis contribute to the gain calc -
        # otherwise a manually-valued asset with no cost basis (e.g. real estate)
        # would be counted as 100% profit.
        if h["cost_basis_krw"] is not None:
            total_cost_krw += h["cost_basis_krw"]
            total_gain_krw += h["gain_krw"] or 0.0

    total_gain_krw = total_gain_krw if total_cost_krw else None
    total_gain_pct = (total_gain_krw / total_cost_krw * 100) if total_cost_krw else None

    with get_conn() as conn:
        liabilities = [dict(r) for r in conn.execute("SELECT * FROM liabilities")]
    total_liabilities_krw = sum(l["balance_krw"] for l in liabilities)
    net_worth_krw = total_krw - total_liabilities_krw

    return {
        "fx_usdkrw": fx,
        "total_krw": total_krw,
        "total_cost_krw": total_cost_krw or None,
        "total_gain_krw": total_gain_krw,
        "total_gain_pct": total_gain_pct,
        "total_liabilities_krw": total_liabilities_krw,
        "net_worth_krw": net_worth_krw,
        "by_category": by_category,
    }


@app.post("/api/snapshot")
def create_snapshot():
    data = summary()
    today = date.today().isoformat()
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM snapshots WHERE date = ?", (today,)).fetchone()
        breakdown = json.dumps(data["by_category"])
        # snapshots.total_krw tracks net worth (assets minus liabilities), not gross assets
        if existing:
            conn.execute(
                "UPDATE snapshots SET total_krw=?, breakdown_json=? WHERE id=?",
                (data["net_worth_krw"], breakdown, existing["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO snapshots (date, total_krw, breakdown_json) VALUES (?, ?, ?)",
                (today, data["net_worth_krw"], breakdown),
            )
    return {"ok": True, "date": today, "net_worth_krw": data["net_worth_krw"]}


@app.get("/api/snapshots")
def list_snapshots():
    with get_conn() as conn:
        rows = conn.execute("SELECT date, total_krw FROM snapshots ORDER BY date").fetchall()
    return [{"date": r["date"], "total_krw": r["total_krw"]} for r in rows]


# ---------- transactions (household ledger) ----------

@app.get("/api/transactions")
def list_transactions(month: Optional[str] = None, kind: str = "ledger"):
    query = "SELECT * FROM transactions WHERE kind = ?"
    params: list = [kind]
    if month:
        query += " AND date LIKE ?"
        params.append(f"{month}%")
    query += " ORDER BY date DESC, id DESC"
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute(query, params)]
    return rows


@app.post("/api/transactions")
def create_transaction(body: TransactionIn):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO transactions (date, type, category, amount, memo, kind, payment_method, count_in_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (body.date, body.type, body.category, body.amount, body.memo, body.kind,
             body.payment_method, int(body.count_in_total)),
        )
        return {"id": cur.lastrowid}


@app.put("/api/transactions/{tx_id}")
def update_transaction(tx_id: int, body: TransactionIn):
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM transactions WHERE id = ?", (tx_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Transaction not found")
        conn.execute(
            "UPDATE transactions SET date=?, type=?, category=?, amount=?, memo=?, kind=?, payment_method=?, count_in_total=? WHERE id=?",
            (body.date, body.type, body.category, body.amount, body.memo, body.kind,
             body.payment_method, int(body.count_in_total), tx_id),
        )
    return {"ok": True}


@app.delete("/api/transactions/{tx_id}")
def delete_transaction(tx_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
    return {"ok": True}


@app.get("/api/transactions/summary")
def transactions_summary(month: str, kind: str = "ledger"):
    with get_conn() as conn:
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT type, category, amount FROM transactions WHERE kind = ? AND count_in_total = 1 AND date LIKE ?",
                (kind, f"{month}%"),
            )
        ]
    income = sum(r["amount"] for r in rows if r["type"] == "income")
    expense = sum(r["amount"] for r in rows if r["type"] == "expense")
    by_category: dict[str, float] = {}
    by_category_income: dict[str, float] = {}
    for r in rows:
        if r["type"] == "expense":
            by_category[r["category"]] = by_category.get(r["category"], 0.0) + r["amount"]
        else:
            by_category_income[r["category"]] = by_category_income.get(r["category"], 0.0) + r["amount"]
    return {
        "income": income,
        "expense": expense,
        "net": income - expense,
        "by_category": by_category,
        "by_category_income": by_category_income,
    }


@app.get("/api/transactions/years")
def transaction_years(kind: str = "ledger"):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT substr(date, 1, 4) AS year FROM transactions WHERE kind = ? ORDER BY year DESC",
            (kind,),
        ).fetchall()
    return [r["year"] for r in rows]


@app.get("/api/transactions/yearly")
def transactions_yearly(year: str, kind: str = "ledger"):
    with get_conn() as conn:
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT date, type, category, amount, payment_method FROM transactions "
                "WHERE kind = ? AND count_in_total = 1 AND date LIKE ?",
                (kind, f"{year}-%"),
            )
        ]
    months = []
    for m in range(1, 13):
        month_key = f"{year}-{m:02d}"
        month_rows = [r for r in rows if r["date"].startswith(month_key)]
        income = sum(r["amount"] for r in month_rows if r["type"] == "income")
        expense = sum(r["amount"] for r in month_rows if r["type"] == "expense")
        months.append({"month": month_key, "income": income, "expense": expense})

    by_category: dict[str, float] = {}
    by_category_income: dict[str, float] = {}
    monthly_by_category: dict[str, list[float]] = {}
    monthly_by_category_income: dict[str, list[float]] = {}
    payment_method_totals: dict[str, float] = {}

    for r in rows:
        month_idx = int(r["date"][5:7]) - 1
        if r["type"] == "expense":
            by_category[r["category"]] = by_category.get(r["category"], 0.0) + r["amount"]
            bucket = monthly_by_category.setdefault(r["category"], [0.0] * 12)
            bucket[month_idx] += r["amount"]
            if r["payment_method"]:
                payment_method_totals[r["payment_method"]] = (
                    payment_method_totals.get(r["payment_method"], 0.0) + r["amount"]
                )
        else:
            by_category_income[r["category"]] = by_category_income.get(r["category"], 0.0) + r["amount"]
            bucket = monthly_by_category_income.setdefault(r["category"], [0.0] * 12)
            bucket[month_idx] += r["amount"]

    total_income = sum(mo["income"] for mo in months)
    total_expense = sum(mo["expense"] for mo in months)
    return {
        "year": year,
        "months": months,
        "by_category": by_category,
        "by_category_income": by_category_income,
        "monthly_by_category": monthly_by_category,
        "monthly_by_category_income": monthly_by_category_income,
        "payment_method_totals": payment_method_totals,
        "total_income": total_income,
        "total_expense": total_expense,
        "net": total_income - total_expense,
    }


# ---------- investments (large/irregular transfers kept out of the household ledger) ----------

@app.get("/api/investments")
def list_investments():
    with get_conn() as conn:
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM transactions WHERE kind = 'investment' ORDER BY date DESC, id DESC"
            )
        ]
    return rows


@app.get("/api/investments/summary")
def investments_summary():
    with get_conn() as conn:
        rows = [
            dict(r)
            for r in conn.execute(
                "SELECT type, category, amount FROM transactions WHERE kind = 'investment' AND count_in_total = 1"
            )
        ]
    income = sum(r["amount"] for r in rows if r["type"] == "income")
    expense = sum(r["amount"] for r in rows if r["type"] == "expense")
    by_category: dict[str, float] = {}
    for r in rows:
        by_category[r["category"]] = by_category.get(r["category"], 0.0) + (
            r["amount"] if r["type"] == "income" else -r["amount"]
        )
    return {"income": income, "expense": expense, "net": income - expense, "by_category": by_category}


# ---------- goals & settings ----------

@app.get("/api/settings/birth_year")
def get_birth_year():
    with get_conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key='birth_year'").fetchone()
    return {"birth_year": int(row["value"]) if row else None}


@app.put("/api/settings/birth_year")
def set_birth_year(body: BirthYearIn):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('birth_year', ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (str(body.birth_year),),
        )
    return {"ok": True}


@app.get("/api/goals")
def list_goals():
    # Goals target net worth (assets minus liabilities), matching the user's handwritten "순자산" targets.
    current_net_worth = summary()["net_worth_krw"]
    with get_conn() as conn:
        birth_row = conn.execute("SELECT value FROM settings WHERE key='birth_year'").fetchone()
        rows = [dict(r) for r in conn.execute("SELECT * FROM goals ORDER BY age")]
    birth_year = int(birth_row["value"]) if birth_row else None
    goals = []
    for r in rows:
        progress_pct = (current_net_worth / r["target_krw"] * 100) if r["target_krw"] else None
        goals.append(
            {
                **r,
                "target_year": (birth_year + r["age"]) if birth_year else None,
                "progress_pct": progress_pct,
                "achieved": progress_pct is not None and progress_pct >= 100,
            }
        )
    return {"birth_year": birth_year, "current_net_worth_krw": current_net_worth, "goals": goals}


@app.post("/api/goals")
def create_goal(body: GoalIn):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO goals (age, target_krw, label) VALUES (?, ?, ?)",
            (body.age, body.target_krw, body.label),
        )
        return {"id": cur.lastrowid}


@app.put("/api/goals/{goal_id}")
def update_goal(goal_id: int, body: GoalIn):
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM goals WHERE id = ?", (goal_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Goal not found")
        conn.execute(
            "UPDATE goals SET age=?, target_krw=?, label=? WHERE id=?",
            (body.age, body.target_krw, body.label, goal_id),
        )
    return {"ok": True}


@app.delete("/api/goals/{goal_id}")
def delete_goal(goal_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
    return {"ok": True}


# ---------- net worth progress toward the final goal ----------

_MIN_PACE_DAYS = 30  # snapshots closer together than this are too noisy to extrapolate


def _years_between(start: date, end: date) -> float:
    return (end - start).days / 365.25


@app.get("/api/networth/progress")
def networth_progress():
    """Progress and pace toward the largest goal (the 100억 target by default).

    - required_*: what it takes to hit the final goal by its target year
    - actual_*: the pace measured from the first and latest snapshots
    - projected_*: when the final goal is reached if that pace continues
    """
    goals_data = list_goals()
    current = goals_data["current_net_worth_krw"]
    goals = goals_data["goals"]
    if not goals:
        return {"current_net_worth_krw": current, "final_goal": None, "milestones": []}

    final = max(goals, key=lambda g: g["target_krw"])
    target = final["target_krw"]
    remaining = max(target - current, 0.0)
    today = date.today()

    years_left = None
    if final["target_year"]:
        # treat the goal as due at the end of the target year
        years_left = max(_years_between(today, date(final["target_year"], 12, 31)), 0.0)

    required_cagr = None
    required_annual_increase = None
    required_monthly_increase = None
    if years_left and years_left > 0:
        required_annual_increase = remaining / years_left
        required_monthly_increase = remaining / (years_left * 12)
        if current > 0 and remaining > 0:
            required_cagr = (target / current) ** (1 / years_left) - 1

    with get_conn() as conn:
        snaps = conn.execute("SELECT date, total_krw FROM snapshots ORDER BY date").fetchall()

    pace = {
        "since": None,
        "span_days": None,
        "actual_cagr": None,
        "actual_annual_increase": None,
        "projected_year_cagr": None,
        "projected_year_linear": None,
    }
    if len(snaps) >= 2:
        first, last = snaps[0], snaps[-1]
        d0 = date.fromisoformat(first["date"])
        d1 = date.fromisoformat(last["date"])
        span_days = (d1 - d0).days
        pace["since"] = first["date"]
        pace["span_days"] = span_days
        if span_days >= _MIN_PACE_DAYS:
            span_years = span_days / 365.25
            v0, v1 = first["total_krw"], last["total_krw"]
            annual_increase = (v1 - v0) / span_years
            pace["actual_annual_increase"] = annual_increase
            if v0 > 0 and v1 > 0:
                pace["actual_cagr"] = (v1 / v0) ** (1 / span_years) - 1
            if remaining > 0:
                cagr = pace["actual_cagr"]
                if cagr is not None and cagr > 0 and current > 0:
                    yrs = math.log(target / current) / math.log(1 + cagr)
                    pace["projected_year_cagr"] = round(today.year + yrs, 1)
                if annual_increase > 0:
                    pace["projected_year_linear"] = round(today.year + remaining / annual_increase, 1)

    milestones = [
        {
            "id": g["id"],
            "label": g["label"],
            "age": g["age"],
            "target_year": g["target_year"],
            "target_krw": g["target_krw"],
            "achieved": g["achieved"],
            "position_pct": g["target_krw"] / target * 100 if target else None,
        }
        for g in sorted(goals, key=lambda g: g["target_krw"])
        if g["id"] != final["id"]
    ]

    return {
        "current_net_worth_krw": current,
        "birth_year": goals_data["birth_year"],
        "final_goal": final,
        "remaining_krw": remaining,
        "years_left": years_left,
        "required_cagr": required_cagr,
        "required_annual_increase": required_annual_increase,
        "required_monthly_increase": required_monthly_increase,
        "pace": pace,
        "milestones": milestones,
    }


# ---------- liabilities ----------

@app.get("/api/liabilities")
def list_liabilities():
    with get_conn() as conn:
        rows = [dict(r) for r in conn.execute("SELECT * FROM liabilities ORDER BY id")]
    return rows


@app.post("/api/liabilities")
def create_liability(body: LiabilityIn):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO liabilities (name, balance_krw, note) VALUES (?, ?, ?)",
            (body.name, body.balance_krw, body.note),
        )
        return {"id": cur.lastrowid}


@app.put("/api/liabilities/{liability_id}")
def update_liability(liability_id: int, body: LiabilityIn):
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM liabilities WHERE id = ?", (liability_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Liability not found")
        conn.execute(
            "UPDATE liabilities SET name=?, balance_krw=?, note=?, updated_at=datetime('now') WHERE id=?",
            (body.name, body.balance_krw, body.note, liability_id),
        )
    return {"ok": True}


@app.delete("/api/liabilities/{liability_id}")
def delete_liability(liability_id: int):
    with get_conn() as conn:
        conn.execute("DELETE FROM liabilities WHERE id = ?", (liability_id,))
    return {"ok": True}


# ---------- static frontend ----------

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
