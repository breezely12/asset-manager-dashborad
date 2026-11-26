import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "asset_manager.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK(category IN ('stock', 'crypto', 'cash', 'realestate', 'other')),
    name TEXT NOT NULL,
    symbol TEXT,
    quantity REAL,
    avg_cost REAL,
    manual_value REAL,
    currency TEXT NOT NULL DEFAULT 'KRW',
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    total_krw REAL NOT NULL,
    breakdown_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    memo TEXT,
    kind TEXT NOT NULL DEFAULT 'ledger' CHECK(kind IN ('ledger', 'investment')),
    payment_method TEXT,
    count_in_total INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    age INTEGER NOT NULL,
    target_krw REAL NOT NULL,
    label TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS liabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    balance_krw REAL NOT NULL,
    note TEXT,
    kind TEXT NOT NULL DEFAULT 'other',
    interest_rate REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

# Seeded once from the user's handwritten life-goal note; editable afterwards via the API.
_DEFAULT_BIRTH_YEAR = 1986  # user is 40 in 2026
_DEFAULT_GOALS = [
    (37, 300_000_000, "37세 목표"),
    (40, 500_000_000, "40세 목표"),
    (50, 3_000_000_000, "50대 목표"),
    (60, 10_000_000_000, "60대 목표"),
]


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        tx_columns = {row["name"] for row in conn.execute("PRAGMA table_info(transactions)")}
        if "kind" not in tx_columns:
            conn.execute(
                "ALTER TABLE transactions ADD COLUMN kind TEXT NOT NULL DEFAULT 'ledger'"
            )
        if "payment_method" not in tx_columns:
            conn.execute("ALTER TABLE transactions ADD COLUMN payment_method TEXT")
        if "count_in_total" not in tx_columns:
            conn.execute(
                "ALTER TABLE transactions ADD COLUMN count_in_total INTEGER NOT NULL DEFAULT 1"
            )
        liab_columns = {row["name"] for row in conn.execute("PRAGMA table_info(liabilities)")}
        if "kind" not in liab_columns:
            conn.execute("ALTER TABLE liabilities ADD COLUMN kind TEXT NOT NULL DEFAULT 'other'")
        if "interest_rate" not in liab_columns:
            # annual rate in percent (e.g. 4.2); NULL for interest-free debt like 전세보증금
            conn.execute("ALTER TABLE liabilities ADD COLUMN interest_rate REAL")
        if conn.execute("SELECT COUNT(*) FROM goals").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO goals (age, target_krw, label) VALUES (?, ?, ?)", _DEFAULT_GOALS
            )
        if conn.execute("SELECT COUNT(*) FROM settings WHERE key='birth_year'").fetchone()[0] == 0:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('birth_year', ?)",
                (str(_DEFAULT_BIRTH_YEAR),),
            )


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()
