import os, requests, base64

api_key = os.environ.get('FUB_API_KEY', '')
creds = base64.b64encode(f'{api_key}:'.encode()).decode()
headers = {'Authorization': f'Basic {creds}'}

# Get Tiffany's user ID
r = requests.get('https://api.followupboss.com/v1/users?limit=50', headers=headers, timeout=15)
users = r.json().get('users', [])
tiffany = next((u for u in users if (u.get('firstName') or '').lower() == 'tiffany'), None)
if not tiffany:
    print("ERROR: Tiffany not found in FUB users")
    exit(1)

tid = tiffany['id']
print(f"Tiffany: id={tid}, name={tiffany['name']}, status={tiffany['status']}")

# Fetch her leads
r2 = requests.get(
    f'https://api.followupboss.com/v1/people?limit=100&assignedUserId={tid}',
    headers=headers, timeout=15
)
people = r2.json().get('people', [])
print(f"Total leads assigned to Tiffany (first page): {len(people)}")

# Check how many pass the filters
EXCLUDED_STAGES = {'hot prospect', 'active client', 'pending', 'closed', 'past client', 'sphere', 'trash'}
EXCLUDED_TAGS = {'do not nurture', 'no ai email', 'unsubscribed', 'opt-out-auto-trash'}

passed = 0
filtered_pond = 0
filtered_stage = 0
filtered_tag = 0
filtered_no_phone = 0

for p in people:
    if p.get('assignedPondId'):
        filtered_pond += 1
        continue
    stage = str(p.get('stage') or '').lower()
    if stage in EXCLUDED_STAGES:
        filtered_stage += 1
        continue
    tags = [t.lower() for t in (p.get('tags') or [])]
    if any(t in EXCLUDED_TAGS for t in tags):
        filtered_tag += 1
        continue
    phones = p.get('phones') or []
    phone_val = phones[0].get('value') or phones[0].get('phone') if phones else None
    if not phone_val:
        filtered_no_phone += 1
        continue
    passed += 1

print(f"  Passed filters: {passed}")
print(f"  Filtered (in pond): {filtered_pond}")
print(f"  Filtered (excluded stage): {filtered_stage}")
print(f"  Filtered (excluded tag): {filtered_tag}")
print(f"  Filtered (no phone): {filtered_no_phone}")
