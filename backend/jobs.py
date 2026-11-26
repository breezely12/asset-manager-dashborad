"""Daily background work: an automatic net-worth snapshot and a database backup.

Runs inside the uvicorn process, so it only happens while the server is up.
It wakes once an hour: the backup is written once per day, and today's
snapshot is refreshed every hour (so the day's last value is what's kept).

Env vars:
- AUTO_SNAPSHOT=0      turn the daily snapshot off
- BACKUP_DIR=/path     where backups go (default data/backups). Point this at a
                       cloud-synced folder (iCloud Drive, Google Drive, Dropbox)
                       so a copy survives losing this computer.
- BACKUP_KEEP=30       how many daily backup files to keep
"""
from __future__ import annotations

import asyncio
import logging
import os
import sqlite3
from datetime import date, datetime
from pathlib import Path

from .db import DB_PATH

log = logging.getLogger("asset_manager.jobs")

_CHECK_INTERVAL_SECONDS = 60 * 60

status: dict = {
    "last_snapshot_date": None,
    "last_snapshot_at": None,
    "last_snapshot_skipped_reason": None,
    "last_backup_path": None,
    "last_backup_at": None,
    "last_error": None,
}


def backup_dir() -> Path:
    custom = os.environ.get("BACKUP_DIR")
    return Path(custom).expanduser() if custom else DB_PATH.parent / "backups"


def _keep_count() -> int:
    try:
        return max(int(os.environ.get("BACKUP_KEEP", "30")), 1)
    except ValueError:
        return 30


def write_backup(dest: Path) -> Path:
    """Consistent copy via SQLite's online backup API (safe while the app is writing)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    src = sqlite3.connect(DB_PATH)
    try:
        out = sqlite3.connect(dest)
        try:
            src.backup(out)
        finally:
            out.close()
    finally:
        src.close()
    return dest


def list_backups() -> list[Path]:
    d = backup_dir()
    if not d.exists():
        return []
    return sorted(d.glob("asset_manager-*.db"))


def daily_backup(today: date | None = None) -> Path | None:
    today = today or date.today()
    dest = backup_dir() / f"asset_manager-{today.isoformat()}.db"
    if dest.exists():
        return None
    write_backup(dest)
    for old in list_backups()[:-_keep_count()]:
        old.unlink(missing_ok=True)
    status["last_backup_path"] = str(dest)
    status["last_backup_at"] = datetime.now().isoformat(timespec="seconds")
    return dest


def daily_snapshot(snapshot_fn, has_holdings_fn, price_failures_fn) -> bool:
    """Record today's net worth. Runs every check, so today's row is upserted
    hourly and the last value of the day is what stays in the history."""
    if os.environ.get("AUTO_SNAPSHOT", "1") == "0":
        return False
    if not has_holdings_fn():
        status["last_snapshot_skipped_reason"] = "등록된 자산 없음"
        return False
    # A failed price lookup counts that holding as 0원, which would record a
    # false drop in net worth. Skip and try again next hour instead.
    failures = price_failures_fn()
    if failures:
        status["last_snapshot_skipped_reason"] = f"시세 조회 실패 {failures}건"
        return False
    snapshot_fn()
    status["last_snapshot_date"] = date.today().isoformat()
    status["last_snapshot_at"] = datetime.now().isoformat(timespec="seconds")
    status["last_snapshot_skipped_reason"] = None
    return True


async def run_forever(snapshot_fn, has_holdings_fn, price_failures_fn) -> None:
    while True:
        try:
            await asyncio.to_thread(daily_backup)
            await asyncio.to_thread(daily_snapshot, snapshot_fn, has_holdings_fn, price_failures_fn)
            status["last_error"] = None
        except Exception as exc:  # noqa: BLE001 - keep the loop alive
            status["last_error"] = str(exc)
            log.exception("daily job failed")
        await asyncio.sleep(_CHECK_INTERVAL_SECONDS)
