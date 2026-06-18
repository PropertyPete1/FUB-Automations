#!/usr/bin/env python3
"""
prune_audit_log.py — Weekly audit log pruning job.
Deletes audit_log rows older than 90 days to prevent unbounded growth.
Safe to run repeatedly (idempotent).
Triggered weekly by the Manus heartbeat → /api/scheduled/prune-audit-log.
"""
import sqlite3
import sys
import json
import logging
from pathlib import Path
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s prune_audit_log: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

DB_PATH = Path("/home/ubuntu/fub_automation/data/fub_automation.sqlite3")
RETENTION_DAYS = 90


def prune() -> dict:
    if not DB_PATH.exists():
        log.warning("SQLite DB not found at %s — skipping", DB_PATH)
        return {"ok": True, "skipped": "db-not-found", "deleted": 0}

    db = sqlite3.connect(str(DB_PATH))
    try:
        cur = db.cursor()

        # Count rows before pruning
        cur.execute("SELECT COUNT(*) FROM audit_log")
        before = cur.fetchone()[0]

        # Count rows that will be deleted
        cur.execute(
            "SELECT COUNT(*) FROM audit_log WHERE created_at < datetime('now', ?)",
            (f"-{RETENTION_DAYS} days",),
        )
        to_delete = cur.fetchone()[0]

        if to_delete == 0:
            log.info(
                "No rows older than %d days found (total rows: %d) — nothing to prune",
                RETENTION_DAYS,
                before,
            )
            db.close()
            return {"ok": True, "deleted": 0, "total_before": before, "total_after": before}

        # Delete old rows
        cur.execute(
            "DELETE FROM audit_log WHERE created_at < datetime('now', ?)",
            (f"-{RETENTION_DAYS} days",),
        )
        db.commit()

        # Count rows after pruning
        cur.execute("SELECT COUNT(*) FROM audit_log")
        after = cur.fetchone()[0]

        log.info(
            "Pruned %d rows older than %d days from audit_log (before: %d, after: %d)",
            to_delete,
            RETENTION_DAYS,
            before,
            after,
        )
        db.close()
        return {
            "ok": True,
            "deleted": to_delete,
            "total_before": before,
            "total_after": after,
            "retention_days": RETENTION_DAYS,
            "pruned_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        db.rollback()
        db.close()
        log.error("Pruning failed: %s", e)
        raise


if __name__ == "__main__":
    try:
        result = prune()
        print(json.dumps(result, indent=2))
        sys.exit(0)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)
