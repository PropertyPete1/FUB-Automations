#!/usr/bin/env python3
from __future__ import annotations

import os
import re
from pathlib import Path

from run_phase1_agent_reminders import load_dotenv


def sanitize_body(body: str, max_leads: int = 4) -> str:
    sanitized_lines = []
    lead_counter = 0
    for line in body.splitlines():
        if line.startswith('- '):
            lead_counter += 1
            if lead_counter <= max_leads:
                # Preserve format and stage while removing the actual person name and FUB ID.
                parts = [part.strip() for part in line[2:].split('—')]
                stage = parts[1] if len(parts) > 1 else 'Stage'
                sanitized_lines.append(f'- Lead {lead_counter} — {stage} — FUB ID hidden')
            elif lead_counter == max_leads + 1:
                sanitized_lines.append('- Additional leads hidden in this preview')
            continue
        sanitized_lines.append(line)
    return '\n'.join(sanitized_lines)


def main() -> int:
    load_dotenv()
    os.environ['DRY_RUN'] = 'true'
    os.environ['FUB_DISABLE_SCHEDULER'] = 'true'

    from src.fub_automation.main import AuditDB, FollowUpBossClient, RuleEngine, Rules, Settings

    settings = Settings.from_env()
    rules = Rules.load(settings.rules_path)
    db = AuditDB(settings.database_path)
    fub = FollowUpBossClient(settings)
    engine = RuleEngine(settings, rules, fub, db)

    captured = []

    def capture_send(to_email: str, subject: str, body: str, **kwargs):
        captured.append({
            'to_email': to_email,
            'subject': subject,
            'body': body,
            'cc': kwargs.get('cc') or [],
        })

    engine.email.send = capture_send  # type: ignore[method-assign]
    engine.scan_agent_followup()

    print(f'preview_count={len(captured)}')
    for item in captured[:2]:
        print('--- PREVIEW ---')
        print(f"To: {item['to_email']}")
        print(f"Subject: {item['subject']}")
        print(sanitize_body(item['body']))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
