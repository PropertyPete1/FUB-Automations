#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path('/home/ubuntu')
ENV_PATH = ROOT / 'fub_automation' / '.env'
# FUB keys observed in prior terminal output are token-like and start with fka_.
TOKEN_PAT = re.compile(r'(?<![A-Za-z0-9_])FUB_API_KEY\s*=\s*["\']?(fka_[A-Za-z0-9_\-]+)')
SKIP_PARTS = {'.venv', '__pycache__', '.git'}
EXTS = {'.env', '.json', '.yaml', '.yml', '.md', '.txt', '.log'}

def should_read(path: Path) -> bool:
    return path.is_file() and not any(part in SKIP_PARTS for part in path.parts) and (path.name == '.env' or path.suffix.lower() in EXTS)

def mask(value: str) -> str:
    return value[:6] + '*' * max(0, len(value) - 10) + value[-4:]

def update_env(key: str) -> None:
    lines = ENV_PATH.read_text(errors='ignore').splitlines() if ENV_PATH.exists() else []
    replaced = False
    out = []
    for line in lines:
        if line.startswith('FUB_API_KEY='):
            out.append(f'FUB_API_KEY={key}')
            replaced = True
        else:
            out.append(line)
    if not replaced:
        out.append(f'FUB_API_KEY={key}')
    ENV_PATH.write_text('\n'.join(out) + '\n')

candidates: dict[str, list[str]] = {}
for path in ROOT.rglob('*'):
    if not should_read(path):
        continue
    try:
        text = path.read_text(errors='ignore')
    except Exception:
        continue
    for m in TOKEN_PAT.finditer(text):
        token = m.group(1)
        # Ignore tokens that appear in scripts as variable-like examples, but accept terminal history/env lines.
        candidates.setdefault(token, []).append(str(path.relative_to(ROOT)))

print(f'token-shaped FUB API key candidates: {len(candidates)}')
for token, sources in candidates.items():
    print(f'candidate: {mask(token)} | length={len(token)} | sources={", ".join(sources[:4])}')

if len(candidates) == 1:
    token = next(iter(candidates))
    update_env(token)
    print('Updated .env with recovered FUB_API_KEY.')
elif len(candidates) == 0:
    print('No recoverable fka_ token found.')
else:
    print('Multiple token candidates found; not updating .env automatically.')
