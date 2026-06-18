import json
from collections import Counter
from pathlib import Path

path = Path('/tmp/manus-mcp/mcp_result_93f485de-9102-4808-bd78-40b6f3c63108.json')
data = json.loads(path.read_text())
messages = []
for thread in data.get('result', {}).get('threads', []):
    for msg in thread.get('messages', []):
        headers = msg.get('pickedHeaders', {}) or {}
        messages.append({
            'internalDate': int(msg.get('internalDate') or 0),
            'from': headers.get('from', ''),
            'to': headers.get('to', ''),
            'cc': headers.get('cc', ''),
            'subject': headers.get('subject', ''),
        })

sent_reminders = [m for m in messages if m['from'].lower().strip() == 'peter@lifestyledesignrealty.com' and m['subject'].startswith('Follow-up reminders:')]
failure_notices = [m for m in messages if 'Delivery Status Notification' in m['subject'] or 'mailer-daemon' in m['from'].lower()]
latest_ts = max([m['internalDate'] for m in sent_reminders], default=0)
# The current run's messages are clustered within a few seconds of the latest sent reminder.
current_sent = [m for m in sent_reminders if latest_ts and latest_ts - m['internalDate'] <= 10_000]
current_threads_to = set(m['to'].lower() for m in current_sent)
current_failures = [m for m in failure_notices if latest_ts and abs(m['internalDate'] - latest_ts) <= 20_000]

print(f"latest_sent_internal_date={latest_ts}")
print(f"current_sent_count={len(current_sent)}")
print(f"current_sent_recipients={','.join(sorted(m['to'] for m in current_sent))}")
print(f"current_cc_count={sum(1 for m in current_sent if m['cc'])}")
print(f"current_failure_count={len(current_failures)}")
for f in current_failures:
    print(f"failure_subject={f['subject']} to={f['to']}")
