#!/usr/bin/env python3
import json
from collections import Counter
from pathlib import Path

src = Path('/home/ubuntu/fub_automation/data/dry_run_report.json')
out = Path('/home/ubuntu/fub_automation/data/dry_run_summary.md')
data = json.loads(src.read_text())
actions = data.get('actions', [])
suppressed = data.get('suppressed', [])

by_type = Counter(a.get('action_type') or 'unknown' for a in actions)
by_stage = Counter(a.get('stage') or 'blank' for a in actions)
by_user = Counter(a.get('assigned_user_name') or 'Unassigned' for a in actions)
by_channel = Counter(a.get('proposed_channels') or 'none' for a in actions)
by_suppression = Counter(s.get('reason') or s.get('suppression_reason') or 'unknown' for s in suppressed)

lines = []
lines.append('# Follow Up Boss Dry-Run Summary\n')
lines.append(f"Generated at: `{data.get('generated_at')}`\n")
lines.append('## Overall Counts\n')
for k, v in data.get('counts', {}).items():
    lines.append(f'- **{k}**: {v}')
lines.append('\n## Proposed Actions by Type\n')
lines.append('| Action type | Count |')
lines.append('| --- | ---: |')
for k, v in by_type.most_common():
    lines.append(f'| {k} | {v} |')
lines.append('\n## Proposed Actions by Stage\n')
lines.append('| Stage | Count |')
lines.append('| --- | ---: |')
for k, v in by_stage.most_common():
    lines.append(f'| {k} | {v} |')
lines.append('\n## Proposed Actions by Assigned User\n')
lines.append('| Assigned user | Count |')
lines.append('| --- | ---: |')
for k, v in by_user.most_common():
    lines.append(f'| {k} | {v} |')
lines.append('\n## Proposed Channels\n')
lines.append('| Channel | Count |')
lines.append('| --- | ---: |')
for k, v in by_channel.most_common():
    lines.append(f'| {k} | {v} |')
lines.append('\n## Suppressed Candidates\n')
lines.append('| Reason | Count |')
lines.append('| --- | ---: |')
for k, v in by_suppression.most_common(20):
    lines.append(f'| {k} | {v} |')

out.write_text('\n'.join(lines) + '\n')
print(out)
