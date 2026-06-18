#!/usr/bin/env python3
"""Analyze the scale of the FUB backlog from the local SQLite cache or recent dry-run outputs."""
import sqlite3
import json
from pathlib import Path

def main():
    root = Path(__file__).resolve().parent
    db_path = root / 'data' / 'fub_automation.db'
    preview_path = root / 'data' / 'phase2_pond_nurture_preview.json'
    
    print("=== FUB Backlog Scale Analysis ===")
    
    # 1. Read preview JSON to see cached counts
    if preview_path.exists():
        try:
            p_data = json.loads(preview_path.read_text(errors='ignore'))
            print(f"Total leads evaluated in last preview: {p_data.get('summary', {}).get('total_evaluated', 'N/A')}")
            print(f"Pond nurture candidates: {p_data.get('summary', {}).get('pond_nurture_candidates', 'N/A')}")
            print(f"Reassignment candidates: {p_data.get('summary', {}).get('reassignment_candidates', 'N/A')}")
        except Exception as e:
            print(f"Error reading preview JSON: {e}")
            
    # 2. Query SQLite audit logs
    if db_path.exists():
        try:
            con = sqlite3.connect(db_path)
            con.row_factory = sqlite3.Row
            
            # Count suppressions
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
