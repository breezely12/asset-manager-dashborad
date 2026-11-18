import time

import httpx

_HEADERS = {"User-Agent": "Mozilla/5.0 (asset-manager-dashboard)"}

_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 60.0


def _cached(key: str):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]
    return None


def _store(key: str, value: dict) -> None:
    _cache[key] = (time.time(), value)


def get_stock_quote(symbol: str) -> dict:
    """Live quote for a ticker (e.g. AAPL, 005930.KS) via Yahoo Finance."""
    key = f"stock:{symbol}"
    cached = _cached(key)
    if cached is not None:
        return cached

    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    try:
        resp = httpx.get(url, headers=_HEADERS, timeout=8.0)
        resp.raise_for_status()
        meta = resp.json()["chart"]["result"][0]["meta"]
        result = {
            "price": meta.get("regularMarketPrice"),
            "currency": meta.get("currency", "USD"),
            "name": meta.get("shortName") or meta.get("symbol") or symbol,
            "ok": True,
        }
    except Exception as exc:  # noqa: BLE001 - surfaced to caller, not fatal
        return {"price": None, "currency": None, "name": symbol, "ok": False, "error": str(exc)}

    _store(key, result)
    return result


def search_crypto(query: str) -> list[dict]:
    """Resolve a crypto name/symbol to CoinGecko ids for the add-holding form."""
    url = "https://api.coingecko.com/api/v3/search"
    try:
        resp = httpx.get(url, params={"query": query}, headers=_HEADERS, timeout=8.0)
        resp.raise_for_status()
        coins = resp.json().get("coins", [])[:10]
        return [{"id": c["id"], "symbol": c["symbol"].upper(), "name": c["name"]} for c in coins]
    except Exception:  # noqa: BLE001
        return []


def get_crypto_price(coingecko_id: str, vs: str = "krw") -> dict:
    key = f"crypto:{coingecko_id}:{vs}"
    cached = _cached(key)
    if cached is not None:
        return cached

    url = "https://api.coingecko.com/api/v3/simple/price"
    try:
        resp = httpx.get(
            url, params={"ids": coingecko_id, "vs_currencies": vs}, headers=_HEADERS, timeout=8.0
        )
        resp.raise_for_status()
        data = resp.json().get(coingecko_id, {})
        price = data.get(vs)
        result = {"price": price, "currency": vs.upper(), "ok": price is not None}
    except Exception as exc:  # noqa: BLE001
        return {"price": None, "currency": vs.upper(), "ok": False, "error": str(exc)}

    _store(key, result)
    return result


def get_usdkrw_rate() -> float:
    key = "fx:USDKRW"
    cached = _cached(key)
    if cached is not None:
        return cached["rate"]

    quote = get_stock_quote("KRW=X")
    rate = quote.get("price") or 1350.0  # fallback if the lookup fails
    _store(key, {"rate": rate})
    return rate
