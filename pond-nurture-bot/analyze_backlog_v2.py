#!/usr/bin/env python3
"""Analyze the scale of the FUB backlog from the correct database path and preview structures."""
import os
import sqlite3
import json
from pathlib import Path

def load_dotenv(path: str = '.env') -> None:
    env_path = Path(path)
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(errors='ignore').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ[key] = value

def main():
    root = Path(__file__).resolve().parent
    load_dotenv(root / '.env')
    
    # Correct path is typically in data/fub_automation.db but let's read the environment
    db_path = Path(os.environ.get('DATABASE_PATH', root / 'data' / 'fub_automation.db'))
    preview_path = root / 'data' / 'phase2_pond_nurture_preview.json'
    
    print("=== FUB Backlog Scale Analysis v2 ===")
    print(f"Database Path: {db_path}")
    print(f"Preview Path: {preview_path}")
    
    # 1. Read preview JSON to see cached counts
    if preview_path.exists():
        try:
            p_data = json.loads(preview_path.read_text(errors='ignore'))
            # Check the keys in the preview JSON
            print("\n=== Preview File Structure ===")
            print(f"Keys in preview JSON: {list(p_data.keys())}")
            
            # The preview JSON might be a list or a dict
            if isinstance(p_data, dict):
                reassignments = p_data.get('reassignments', [])
                emails = p_data.get('emails', [])
                print(f"Reassignments in preview: {len(reassignments)}")
                print(f"Emails in preview: {len(emails)}")
            elif isinstance(p_data, list):
                print(f"Preview is a list of length: {len(p_data)}")
        except Exception as e:
            print(f"Error reading preview JSON: {e}")
            
    # 2. Query SQLite audit logs
    if db_path.exists():
        try:
            con = sqlite3.connect(db_path)
            con.row_factory = sqlite3.Row
            
            # Check tables
            tables = con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            print("\n=== SQLite Tables ===")
            for t in tables:
                print(f"- {t['name']}")
                
            # If audit_log exists
            if any(t['name'] == 'audit_log' for t in tables):
                suppressed = con.execute("SELECT COUNT(*) as cnt FROM audit_log WHERE status='suppressed'").fetchone()['cnt']
                completed_re = con.execute("SELECT COUNT(*) as cnt FROM audit_log WHERE action='stale_agent_pond_reassignment' AND status='completed'").fetchone()['cnt']
                sent_emails = con.execute("SELECT COUNT(*) as cnt FROM audit_log WHERE action='pond_nurture' AND status='sent'").fetchone()['cnt']
                
                print("\n=== SQLite Audit Log Totals ===")
                print(f"Completed Reassignments: {completed_re}")
                print(f"Sent Emails: {sent_emails}")
                print(f"Total Safety Suppressions: {suppressed}")
                
            con.close()
        except Exception as e:
            print(f"Error querying SQLite: {e}")
    else:
        print("SQLite database does not exist yet.")

if __name__ == '__main__':
    main()
