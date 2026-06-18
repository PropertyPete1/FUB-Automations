import sys
import os
import sqlite3

sys.path.insert(0, "src")
from run_approved_daily_automation import load_dotenv
load_dotenv()

from fub_automation.main import Settings, FollowUpBossClient, RuleEngine, Rules, AuditDB

settings = Settings.from_env()
rules = Rules.load(settings.rules_path)
db = AuditDB(settings.database_path)
fub = FollowUpBossClient(settings)
engine = RuleEngine(settings, rules, fub, db)

print("Searching FUB for Frank Atilano...")
try:
    results = fub.get_people(q="Frank Atilano")
    print(f"Search returned {len(results)} people.")
    for person in results:
        p_id = person["id"]
        name = person.get("name")
        created_at = person.get("created")
        assigned_user_id = person.get("assignedUserId")
        assigned_pond_id = person.get("assignedPondId")
        stage = person.get("stage")
        print(f"\nFound Lead: {name} (ID: {p_id})")
        print(f"• Created at (UTC): {created_at}")
        print(f"• Assigned User ID: {assigned_user_id}")
        print(f"• Assigned Pond ID: {assigned_pond_id}")
        print(f"• Stage: {stage}")
        
        # Check notes
        notes = engine.safe_get_notes(p_id)
        print(f"• Total notes: {len(notes)}")
        for n in notes[:5]:
            print(f"  - [{n.get('created')}] {n.get('subject')}: {n.get('body')[:100]}...")
            
        # Check if there's any local timer log
        with sqlite3.connect(settings.database_path) as con:
            con.row_factory = sqlite3.Row
            timer_row = con.execute("SELECT * FROM new_lead_timers WHERE person_id=?", (p_id,)).fetchone()
            if timer_row:
                print(f"• Local Timer DB Row: {dict(timer_row)}")
            else:
                print("• No local timer DB row found for this person_id.")
                
            audit_rows = con.execute("SELECT * FROM audit_log WHERE person_id=? OR details LIKE ?", (p_id, f"%{p_id}%")).fetchall()
            print(f"• Total audit logs: {len(audit_rows)}")
            for r in audit_rows:
                print(f"  - [{r[2]}] Action: {r[1]}, Status: {r[3]}, Details: {r[4]}")
except Exception as e:
    print(f"Error: {e}")
