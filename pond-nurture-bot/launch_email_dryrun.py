#!/usr/bin/env python3
"""
Launch Email Dry-Run Preview
Simulates the June 11 launch email for all 7 agents.
Uses synthetic lead stubs (no full FUB fetch) to run fast.
Forces date to 2026-06-12 so the LAUNCH_DATE gate fires.
Saves HTML output for each agent to /tmp/launch_email_preview/
"""
import os, sys, datetime, json
from pathlib import Path
from unittest.mock import patch, MagicMock
from zoneinfo import ZoneInfo

os.environ["DRY_RUN"] = "true"
os.environ["FUB_DISABLE_SCHEDULER"] = "true"
sys.path.insert(0, "/home/ubuntu/fub_automation")

from dotenv import load_dotenv
load_dotenv()

from src.fub_automation.main import AuditDB, FollowUpBossClient, RuleEngine, Rules, Settings

settings = Settings.from_env()
rules = Rules.load(settings.rules_path)
db = AuditDB(settings.database_path)
fub = FollowUpBossClient(settings)
engine = RuleEngine(settings, rules, fub, db)

# ── Synthetic lead stubs (no FUB fetch needed) ────────────────────────────────
FAKE_LEAD = {
    "id": 99999, "firstName": "John", "lastName": "Doe",
    "stage": "Hot Prospect", "assignedUserId": 0,
    "lastActivityAt": "2026-05-20T10:00:00Z",
    "emails": [{"value": "john.doe@example.com"}],
    "phones": [{"value": "512-555-0100", "type": "mobile"}],
}

ACTIVE_AGENTS = {
    2:  {"name": "Peter Allen",     "email": "peter@lifestyledesignrealty.com"},
    1:  {"name": "Steven Van Orden","email": "steven@lifestyledesignrealty.com"},
    20: {"name": "Tiffany Proske",  "email": "Tiffany@lifestyledesignrealty.com"},
    31: {"name": "Stefanie Graham", "email": "stefanie@lifestyledesignrealty.com"},
    28: {"name": "Abby Martinez",   "email": "abby@lifestyledesignrealty.com"},
    33: {"name": "Irma Vidic Crisp","email": "Irma@lifestyledesignrealty.com"},
    35: {"name": "Laila Maria",     "email": "laila@lifestyledesignrealty.com"},
}

# ── Date patch: patch dt.datetime.now() inside the main module ────────────────
# main.py uses: dt.datetime.now(ZoneInfo(self.rules.local_timezone)).date().isoformat()
# We need to patch datetime.datetime.now in the fub_automation.main module
FAKE_DT = datetime.datetime(2026, 6, 11, 7, 0, 0, tzinfo=ZoneInfo("America/Chicago"))

import src.fub_automation.main as fub_main_module

original_datetime = fub_main_module.dt.datetime

class FakeDatetime(datetime.datetime):
    @classmethod
    def now(cls, tz=None):
        if tz is not None:
            return FAKE_DT.astimezone(tz)
        return FAKE_DT
    @classmethod
    def utcnow(cls):
        return FAKE_DT.replace(tzinfo=None)

# ── Email capture ─────────────────────────────────────────────────────────────
captured = []
def capture_email(to_email, subject, body, from_email=None, reply_to=None, cc=None, html_body=None):
    captured.append({"to": to_email, "subject": subject, "html": html_body or body, "cc": cc or []})
engine.email.send = capture_email  # type: ignore

# ── Run ───────────────────────────────────────────────────────────────────────
output_dir = Path("/tmp/launch_email_preview")
output_dir.mkdir(exist_ok=True)

print("\n" + "="*60)
print("LAUNCH EMAIL DRY-RUN — June 11, 2026")
print("="*60)

results = []

with patch.object(fub_main_module.dt, 'datetime', FakeDatetime):
    for user_id, agent in ACTIVE_AGENTS.items():
        captured.clear()
        first_name = agent["name"].split()[0]
        # 3 synthetic stale leads per agent
        people = [{**FAKE_LEAD, "assignedUserId": user_id} for _ in range(3)]

        print(f"\n[{first_name}] user_id={user_id} | email={agent['email']} | leads=3 (synthetic)")
        try:
            engine.send_agent_reminder_digest(user_id, people)
        except Exception as e:
            print(f"  ERROR: {e}")
            results.append({"agent": first_name, "status": "ERROR", "error": str(e)})
            continue

        if not captured:
            print(f"  WARNING: No email captured")
            results.append({"agent": first_name, "status": "SKIPPED"})
            continue

        email_data = captured[0]
        subject = email_data["subject"]
        html = email_data["html"]
        is_launch = "Command Center Is Live" in subject or "🚀" in subject
        html_path = output_dir / f"launch_email_{first_name.lower()}.html"
        html_path.write_text(html, encoding="utf-8")

        has_agent_name = first_name.upper() in html or first_name in html
        has_dashboard = "fub-nurture-phfprjui.manus.space" in html
        has_deal = "deal" in html.lower() or ".pdf" in html
        html_size = len(html)

        status_icon = "✅ LAUNCH" if is_launch else "⚠️  REGULAR"
        print(f"  {status_icon} | Subject: {subject}")
        print(f"  HTML: {html_size:,} chars | agent_name={has_agent_name} | dashboard_link={has_dashboard} | deal_content={has_deal}")
        print(f"  Saved: {html_path}")

        results.append({
            "agent": first_name, "user_id": user_id,
            "status": "LAUNCH" if is_launch else "REGULAR",
            "subject": subject, "html_size": html_size,
            "has_agent_name": has_agent_name,
            "has_dashboard_link": has_dashboard,
            "has_deal_content": has_deal,
            "html_path": str(html_path),
        })

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "="*60)
print("DRY-RUN SUMMARY")
print("="*60)
launch_count  = sum(1 for r in results if r.get("status") == "LAUNCH")
regular_count = sum(1 for r in results if r.get("status") == "REGULAR")
error_count   = sum(1 for r in results if r.get("status") == "ERROR")

print(f"  Launch emails:  {launch_count}/7")
print(f"  Regular emails: {regular_count}/7")
print(f"  Errors:         {error_count}/7")
date_gate_ok = launch_count == 7
print(f"\n  Date-gate:     {'✅ PASS — all 7 got launch subject' if date_gate_ok else '❌ FAIL — not all got launch subject'}")
print(f"\n  HTML previews:")
for r in results:
    if "html_path" in r:
        print(f"    {r['agent']:12s} → {r['html_path']}")

(output_dir / "summary.json").write_text(json.dumps(results, indent=2))
print(f"\n  Full summary: {output_dir}/summary.json")
sys.exit(0 if date_gate_ok else 1)
