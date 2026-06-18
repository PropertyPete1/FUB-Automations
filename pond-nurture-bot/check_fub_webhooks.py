import sys
import os

sys.path.insert(0, "src")
from run_approved_daily_automation import load_dotenv
load_dotenv()

from fub_automation.main import Settings, FollowUpBossClient

settings = Settings.from_env()
fub = FollowUpBossClient(settings)

print("Fetching FUB webhooks...")
try:
    webhooks = fub._request("GET", "/webhooks")
    print(f"Total webhooks found: {len(webhooks.get('webhooks', []))}")
    for w in webhooks.get("webhooks", []):
        print(f"\nWebhook ID: {w.get('id')}")
        print(f"• Event: {w.get('event')}")
        print(f"• URL: {w.get('url')}")
        print(f"• Status: {w.get('status')}")
        print(f"• Created: {w.get('created')}")
except Exception as e:
    print(f"Error: {e}")
