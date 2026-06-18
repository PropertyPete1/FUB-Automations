#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import json
import os
import sqlite3
from pathlib import Path

from run_approved_daily_automation import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.env')
db_path = Path(os.environ.get('DATABASE_PATH', ROOT / 'data' / 'fub_automation.db'))
since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=2)).isoformat()

with sqlite3.connect(db_path) as con:
    con.row_factory = sqlite3.Row
    rows = con.execute(
        """
        SELECT created_at, action, status, person_id, details
        FROM audit_log
        WHERE created_at >= ?
          AND action IN ('pond_nurture','stale_agent_pond_reassignment','agent_followup','phase2_daily_summary')
        ORDER BY created_at DESC
        """,
        (since,),
    ).fetchall()

counts: dict[str, int] = {}
notable: list[dict] = []
for row in rows:
    key = f"{row['action']}::{row['status']}"
    counts[key] = counts.get(key, 0) + 1
    if row['status'] in {'sent', 'completed', 'error', 'launch_cap_reached'} and len(notable) < 30:
        try:
            details = json.loads(row['details'] or '{}')
        except Exception:
            details = {}
        notable.append({
            'created_at': row['created_at'],
            'action': row['action'],
            'status': row['status'],
            'person_id': row['person_id'],
            'details': {k: details.get(k) for k in ('channels','city','city_source','freshness_angle','reason','stage','cap','to','row_count') if k in details},
        })

print(json.dumps({'database_path': str(db_path), 'since': since, 'counts': counts, 'notable': notable}, indent=2))
