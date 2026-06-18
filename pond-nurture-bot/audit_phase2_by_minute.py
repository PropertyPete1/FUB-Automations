#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import os
import sqlite3
from collections import Counter
from pathlib import Path
from run_approved_daily_automation import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.env')
db_path = Path(os.environ.get('DATABASE_PATH', ROOT / 'data' / 'fub_automation.db'))
since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=2)).isoformat()
with sqlite3.connect(db_path) as con:
    rows = con.execute(
        """
        SELECT created_at, action, status
        FROM audit_log
        WHERE created_at >= ?
          AND action IN ('pond_nurture','stale_agent_pond_reassignment','phase2_daily_summary','agent_followup_reminder')
        ORDER BY created_at
        """,
        (since,),
    ).fetchall()

bucket = Counter()
for created_at, action, status in rows:
    minute = str(created_at)[:16]
    bucket[(minute, action, status)] += 1
for (minute, action, status), count in sorted(bucket.items()):
    print(f"{minute} {action} {status} {count}")
