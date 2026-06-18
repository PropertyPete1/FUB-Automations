#!/usr/bin/env python3
"""Search local workspace files for prior FUB credential assignments without printing secrets."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path('/home/ubuntu')
ENV_PATH = ROOT / 'fub_automation' / '.env'

SECRET_KEYS = ['FUB_API_KEY', 'FUB_SYSTEM_NAME', 'FUB_SYSTEM_KEY']
PLACEHOLDERS = {
    '',
    'replace_with_owner_or_admin_api_key',
    'replace_with_registered_system_name',
    'replace_with_registered_system_key',
    'your_api_key',
    'your_system_name',
    'your_system_key',
}

SKIP_PARTS = {'.venv', '__pycache__', '.git'}
EXTS = {'.env', '.json', '.yaml', '.yml', '.md', '.txt', '.log'}


def should_read(path: Path) -> bool:
    if any(part in SKIP_PARTS for part in path.parts):
        return False
    return path.name == '.env' or path.suffix.lower() in EXTS


def clean_value(raw: str) -> str:
    value = raw.strip().strip('"').strip("'").strip()
    if '#' in value:
        value = value.split('#', 1)[0].strip()
    return value


def masked(value: str) -> str:
    if len(value) <= 8:
        return '*' * len(value)
    return value[:3] + '*' * (len(value) - 6) + value[-3:]


def read_env() -> dict[str, str]:
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(errors='ignore').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                k, v = line.split('=', 1)
                env[k.strip()] = v.rstrip('\n')
    return env


def write_env(env: dict[str, str]) -> None:
    lines = []
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(errors='ignore').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                k = line.split('=', 1)[0].strip()
                if k in env:
                    lines.append(f'{k}={env[k]}')
                    continue
            lines.append(line)
    existing = {line.split('=', 1)[0].strip() for line in lines if '=' in line and not line.lstrip().startswith('#')}
    for key, val in env.items():
        if key not in existing:
            lines.append(f'{key}={val}')
    ENV_PATH.write_text('\n'.join(lines) + '\n')


def main() -> int:
    candidates: dict[str, list[tuple[Path, str]]] = {k: [] for k in SECRET_KEYS}
    assignment_patterns = {
        key: re.compile(rf'(?<![A-Za-z0-9_]){re.escape(key)}\s*=\s*([^\n\r]+)')
        for key in SECRET_KEYS
    }

    for path in ROOT.rglob('*'):
        if not path.is_file() or not should_read(path):
            continue
        try:
            text = path.read_text(errors='ignore')
        except Exception:
            continue
        for key, pat in assignment_patterns.items():
            for match in pat.finditer(text):
                value = clean_value(match.group(1))
                if value and value not in PLACEHOLDERS and not value.startswith('${'):
                    candidates[key].append((path, value))

    env = read_env()
    updated = []
    for key in SECRET_KEYS:
        existing = clean_value(env.get(key, ''))
        if existing and existing not in PLACEHOLDERS and not existing.startswith('${'):
            print(f'{key}: already configured ({masked(existing)})')
            continue
        unique_values = []
        for _path, value in candidates[key]:
            if value not in unique_values:
                unique_values.append(value)
        if len(unique_values) == 1:
            env[key] = unique_values[0]
            updated.append(key)
            print(f'{key}: recovered from local files ({masked(unique_values[0])})')
        elif len(unique_values) > 1:
            print(f'{key}: multiple candidate values found; not auto-selecting')
        else:
            print(f'{key}: not found')

    if updated:
        write_env(env)
        print('Updated .env keys: ' + ', '.join(updated))
    else:
        print('No .env updates made')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
