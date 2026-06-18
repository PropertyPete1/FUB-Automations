import os, requests, base64

api_key = os.environ.get('FUB_API_KEY', '')
if not api_key:
    print("ERROR: FUB_API_KEY env var not set")
    exit(1)

creds = base64.b64encode(f'{api_key}:'.encode()).decode()
r = requests.get(
    'https://api.followupboss.com/v1/users?limit=50',
    headers={'Authorization': f'Basic {creds}'},
    timeout=15
)
print("Status:", r.status_code)
users = r.json().get('users', [])
print(f"Total users: {len(users)}")
for u in users:
    print(f"  id={u.get('id')} | name={u.get('name')} | firstName={u.get('firstName')} | status={u.get('status')}")
