#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path('/home/ubuntu')
KEY = 'FUB_API_KEY'
PLACEHOLDERS = {
    '', 'replace_with_owner_or_admin_api_key', 'your_api_key', 'missing', 'set',
    'replace_with_fub_api_key', 'replace_me'
}
SKIP_PARTS = {'.venv', '__pycache__', '.git'}
EXTS = {'.env', '.json', '.yaml', '.yml', '.md', '.txt', '.log'}
pat = re.compile(rf'(?<![A-Za-z0-9_]){KEY}\s*=\s*([^\n\r]+)')

def should_read(path: Path) -> bool:
    return path.is_file() and not any(part in SKIP_PARTS for part in path.parts) and (path.name == '.env' or path.suffix.lower() in EXTS)

def clean(raw: str) -> str:
    value = raw.strip().strip('"').strip("'").strip()
    if '#' in value:
        value = value.split('#', 1)[0].strip()
    return value

def mask(value: str) -> str:
    if len(value) <= 8:
        return '*' * len(value)
    return value[:4] + '*' * (len(value)-8) + value[-4:]

seen = {}
for path in ROOT.rglob('*'):
    if not should_read(path):
        continue
    try:
        text = path.read_text(errors='ignore')
    except Exception:
        continue
    for m in pat.finditer(text):
        value = clean(m.group(1))
        if value in PLACEHOLDERS or value.startswith('${'):
            continue
        seen.setdefault(value, []).append(str(path.relative_to(ROOT)))

print(f'Non-placeholder {KEY} candidates found: {len(seen)}')
for i, (value, sources) in enumerate(seen.items(), start=1):
    print(f'Candidate {i}: {mask(value)} | length={len(value)} | sources={", ".join(sources[:5])}')
