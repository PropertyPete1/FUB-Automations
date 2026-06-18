#!/usr/bin/env python3
from __future__ import annotations

import sqlite3
from pathlib import Path

path = Path('data/phase2_preview_audit.db')
if not path.exists():
    print('database_exists=False')
    raise SystemExit(0)

with sqlite3.connect(path) as con:
    tables = [row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()]
    print('database_exists=True')
    print('tables=' + ','.join(tables))
    for table in ['audit_log', 'reengagement_log']:
        if table not in tables:
            print(f'{table}=missing')
            continue
        cols = con.execute(f'PRAGMA table_info({table})').fetchall()
        print(f'{table}_columns=' + ','.join(row[1] for row in cols))
        count = con.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
        print(f'{table}_rows={count}')
