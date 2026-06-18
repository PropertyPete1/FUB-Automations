#!/usr/bin/env python3
import os
import sys
import datetime as dt
from pathlib import Path

# Add src to path
sys.path.append(str(Path(__file__).resolve().parent / "src"))

from fub_automation.main import AuditDB, FollowUpBossClient, RuleEngine, Rules, Settings

def main():
    # Load dotenv
    env_path = Path(__file__).resolve().parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.strip() and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip().strip('"').strip("'")

    settings = Settings.from_env()
    rules = Rules.load(settings.rules_path)
    
    db = AuditDB(settings.database_path)
    fub = FollowUpBossClient(settings)
    engine = RuleEngine(settings, rules, fub, db)
    
    print("Scanning for agent follow-up candidates...")
    cutoff_dt = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=rules.agent_followup_days)
    cutoff = cutoff_dt.strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        candidates = fub.get_people(lastActivityBefore=cutoff)
        print(f"Found {len(candidates)} total candidates before cutoff {cutoff}")
        
        valid_count = 0
        for person in candidates[:20]: # Check first 20
            name = f"{person.get('firstName', '')} {person.get('lastName', '')}".strip()
            is_ex = engine.is_excluded(person)
            has_pond = person.get("assignedPondId")
            has_touch = engine.has_recent_omnichannel_touch(person, rules.agent_followup_days)
            
            print(f"Lead: {name} | Excluded: {is_ex} | Pond: {has_pond} | Recent Touch: {has_touch}")
            if not is_ex and not has_pond and not has_touch:
                valid_count += 1
        print(f"Valid count in sample: {valid_count}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
