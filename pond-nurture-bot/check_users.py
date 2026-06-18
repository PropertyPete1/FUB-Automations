import sys, yaml
sys.path.insert(0, 'src')
try:
    from fub_automation.fub_client import FUBClient
except ImportError:
    from src.fub_automation.fub_client import FUBClient

with open('config/rules.yaml') as f:
    data = yaml.safe_load(f)
api_key = data.get('fub_api_key', '')

fub = FUBClient(api_key)
users = fub.users()
for u in users:
    uid = u.get('id')
    name = u.get('name')
    first = u.get('firstName')
    email = u.get('email')
    status = u.get('status')
    print(f"id={uid} | name={name} | firstName={first} | email={email} | status={status}")
