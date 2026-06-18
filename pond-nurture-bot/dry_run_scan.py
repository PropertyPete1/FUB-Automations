import csv
import getpass
import json
import os
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from zoneinfo import ZoneInfo

import requests
import yaml

BASE = "https://api.followupboss.com/v1"
ROOT = Path("/home/ubuntu/fub_automation")
OUT_DIR = ROOT / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)
REPORT_MD = OUT_DIR / "dry_run_report.md"
REPORT_JSON = OUT_DIR / "dry_run_report.json"
REPORT_CSV = OUT_DIR / "dry_run_actions.csv"
RULES_PATH = ROOT / "config" / "rules.yaml"
UTC = timezone.utc


def now_utc() -> datetime:
    return datetime.now(UTC)


def parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, dict):
        value = value.get("date") or value.get("created") or value.get("updated")
    if not isinstance(value, str):
        return None
    value = value.replace("Z", "+00:00")
    for candidate in [value, value[:19] + "+00:00" if len(value) >= 19 else value]:
        try:
            parsed = datetime.fromisoformat(candidate)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return parsed.astimezone(UTC)
        except Exception:
            pass
    return None


def days_since(value: Optional[datetime]) -> Optional[float]:
    if not value:
        return None
    return round((now_utc() - value).total_seconds() / 86400, 1)


def business_minutes_elapsed(start_utc: datetime, end_utc: datetime, rules: dict) -> float:
    """Return elapsed new-lead timer minutes using configured business hours."""
    mode = str(rules.get("new_lead_timer_mode", "business_hours")).lower()
    if mode in {"24_7", "24/7", "always", "wall_clock"}:
        return max(0.0, (end_utc - start_utc).total_seconds() / 60)

    tz = ZoneInfo(str(rules.get("local_timezone", "America/Chicago")))
    start_local = start_utc.astimezone(tz)
    end_local = end_utc.astimezone(tz)
    if end_local <= start_local:
        return 0.0

    start_time = time.fromisoformat(str(rules.get("business_hours_start", "10:00")))
    end_time = time.fromisoformat(str(rules.get("business_hours_end", "18:00")))
    days = {int(day) for day in rules.get("business_hours_days", [0, 1, 2, 3, 4, 5, 6])}

    total = 0.0
    current_day = start_local.date()
    while current_day <= end_local.date():
        if current_day.weekday() in days:
            window_start = datetime.combine(current_day, start_time, tzinfo=tz)
            window_end = datetime.combine(current_day, end_time, tzinfo=tz)
            overlap_start = max(start_local, window_start)
            overlap_end = min(end_local, window_end)
            if overlap_end > overlap_start:
                total += (overlap_end - overlap_start).total_seconds() / 60
        current_day += timedelta(days=1)
    return total


def get(path: str, key: str, params: Optional[dict] = None) -> dict:
    last_error = None
    for attempt in range(1, 4):
        try:
            response = requests.get(
                f"{BASE}{path}",
                auth=(key, ""),
                headers={"Accept": "application/json"},
                params=params or {},
                timeout=45,
            )
            if response.status_code in {429, 500, 502, 503, 504} and attempt < 3:
                print(f"Transient FUB status {response.status_code}; retrying attempt {attempt + 1}/3", flush=True)
                import time
                time.sleep(2 * attempt)
                continue
            if response.status_code >= 400:
                raise RuntimeError(f"GET {path} failed {response.status_code}: {response.text[:500]}")
            return response.json() if response.text else {}
        except requests.RequestException as exc:
            last_error = exc
            if attempt < 3:
                print(f"Transient FUB connection issue; retrying attempt {attempt + 1}/3: {exc}", flush=True)
                import time
                time.sleep(2 * attempt)
                continue
            raise
    raise RuntimeError(f"GET {path} failed after retries: {last_error}")


def load_rules() -> dict:
    with RULES_PATH.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def normalize_tags(person: dict) -> List[str]:
    tags = person.get("tags") or []
    result = []
    for tag in tags:
        if isinstance(tag, str):
            result.append(tag)
        elif isinstance(tag, dict):
            result.append(str(tag.get("name") or tag.get("label") or tag.get("value") or tag))
    return result


def has_any_tag(person: dict, tags: Iterable[str]) -> bool:
    contact_tags = {t.lower().strip() for t in normalize_tags(person)}
    desired = {str(t).lower().strip() for t in tags}
    return bool(contact_tags.intersection(desired))


def is_excluded(person: dict, rules: dict) -> Optional[str]:
    stage = str(person.get("stage") or "").lower().strip()
    excluded_stages = {str(s).lower().strip() for s in rules.get("excluded_stages", [])}
    if stage in excluded_stages:
        return f"excluded stage: {person.get('stage')}"
    if has_any_tag(person, rules.get("excluded_tags", [])):
        return "excluded tag"
    return None


def person_name(person: dict) -> str:
    return person.get("name") or " ".join(filter(None, [person.get("firstName"), person.get("lastName")])) or f"Lead {person.get('id')}"


def first_email(person: dict) -> str:
    emails = person.get("emails") or []
    if not emails:
        return ""
    first = emails[0]
    if isinstance(first, str):
        return first
    return first.get("value") or first.get("email") or ""


def first_phone(person: dict) -> str:
    phones = person.get("phones") or []
    if not phones:
        return ""
    first = phones[0]
    if isinstance(first, str):
        return first
    return first.get("value") or first.get("number") or ""


def best_contact_dt(person: dict) -> Optional[datetime]:
    communication = person.get("lastCommunication")
    if isinstance(communication, dict):
        dt_val = parse_dt(communication.get("date"))
        if dt_val:
            return dt_val
    for key in ["lastSentEmail", "lastSentText", "lastCall", "lastActivity"]:
        dt_val = parse_dt(person.get(key))
        if dt_val:
            return dt_val
    return None


def created_dt(person: dict) -> Optional[datetime]:
    for key in ["created", "createdAt", "registered", "updated"]:
        dt_val = parse_dt(person.get(key))
        if dt_val:
            return dt_val
    return None


def collect_people(key: str, params: dict, max_pages: int = 10) -> List[dict]:
    people: List[dict] = []
    seen = set()
    next_cursor = None
    for page_num in range(max_pages):
        page_params = dict(params)
        page_params.setdefault("limit", 100)
        page_params.setdefault("fields", "allFields")
        if next_cursor:
            page_params["next"] = next_cursor
        data = get("/people", key, page_params)
        meta = data.get("_metadata") or {}
        batch = data.get("people") or data.get("data") or []
        print(f"Fetched {len(batch)} people from /people page {page_num + 1}; total collected={len(people) + len(batch)}", flush=True)
        if not batch:
            break
        new_count = 0
        for p in batch:
            pid = p.get("id")
            if pid not in seen:
                people.append(p)
                seen.add(pid)
                new_count += 1
        next_cursor = meta.get("next")
        if not next_cursor or len(batch) < int(page_params.get("limit", 100)) or new_count == 0:
            break
    return people


def user_map(key: str) -> Dict[int, dict]:
    data = get("/users", key, {"limit": 100})
    users = data.get("users") or data.get("data") or []
    return {int(u["id"]): u for u in users if u.get("id") is not None}


def user_name(users: Dict[int, dict], uid: Any) -> str:
    try:
        user = users.get(int(uid))
    except Exception:
        user = None
    if not user:
        return str(uid or "")
    return user.get("name") or " ".join(filter(None, [user.get("firstName"), user.get("lastName")])) or str(uid)


def make_action(action_type: str, person: dict, reason: str, users: Dict[int, dict], extra: Optional[dict] = None) -> dict:
    contact = best_contact_dt(person)
    created = created_dt(person)
    out = {
        "action_type": action_type,
        "person_id": person.get("id"),
        "lead_name": person_name(person),
        "stage": person.get("stage") or "",
        "assigned_user_id": person.get("assignedUserId") or "",
        "assigned_user_name": user_name(users, person.get("assignedUserId")),
        "assigned_pond_id": person.get("assignedPondId") or "",
        "email_present": bool(first_email(person)),
        "phone_present": bool(first_phone(person)),
        "tags": ", ".join(normalize_tags(person)),
        "last_contact_or_activity": contact.isoformat() if contact else "",
        "days_since_contact_or_activity": days_since(contact),
        "created": created.isoformat() if created else "",
        "lead_age_minutes": round((now_utc() - created).total_seconds() / 60, 1) if created else "",
        "reason": reason,
        "dry_run_result": "WOULD NOTIFY ONLY - no live action taken",
    }
    if extra:
        out.update(extra)
    return out


def scan(key: str) -> dict:
    rules = load_rules()
    users = user_map(key)
    now = now_utc()
    stale_cutoff = (now - timedelta(days=int(rules.get("stale_no_contact_days", 30)))).strftime("%Y-%m-%d %H:%M:%S")
    agent_cutoff = (now - timedelta(days=int(rules.get("agent_followup_days", 14)))).strftime("%Y-%m-%d %H:%M:%S")
    recent_cutoff = (now - timedelta(hours=3)).strftime("%Y-%m-%d %H:%M:%S")

    stale_people = collect_people(key, {"lastActivityBefore": stale_cutoff}, max_pages=5)
    agent_people = collect_people(key, {"lastActivityBefore": agent_cutoff}, max_pages=5)
    # Pull the newest leads as an approximation for speed-to-lead dry-run. If createdAfter is unsupported, fall back to newest people.
    try:
        recent_people = collect_people(key, {"createdAfter": recent_cutoff}, max_pages=5)
    except Exception:
        recent_people = collect_people(key, {}, max_pages=2)

    actions = []
    suppressed = []
    stale_stage_names = {str(s).lower().strip() for s in rules.get("stale_stages", [])}
    stale_tags = rules.get("stale_tags", []) + rules.get("unresponsive_tags", [])

    for p in stale_people:
        reason_excluded = is_excluded(p, rules)
        if reason_excluded:
            suppressed.append(make_action("suppressed", p, reason_excluded, users))
            continue
        contact = best_contact_dt(p)
        stale_by_time = not contact or contact <= now - timedelta(days=int(rules.get("stale_no_contact_days", 30)))
        stale_by_stage = str(p.get("stage") or "").lower().strip() in stale_stage_names
        stale_by_pond = bool(p.get("assignedPondId"))
        stale_by_tag = has_any_tag(p, stale_tags)
        if stale_by_time and (stale_by_stage or stale_by_pond or stale_by_tag or True):
            channels = []
            if first_email(p) and not has_any_tag(p, rules.get("email_opt_out_tags", [])):
                channels.append("email")
            if rules.get("sms_outreach_enabled", False) and first_phone(p) and has_any_tag(p, rules.get("sms_consent_tags", [])) and not has_any_tag(p, rules.get("sms_opt_out_tags", [])):
                channels.append("sms")
            if channels:
                actions.append(make_action("stale_reengagement", p, f"No contact/activity for {days_since(contact)} days; eligible channel(s): {', '.join(channels)}", users, {"proposed_channels": ", ".join(channels)}))
            else:
                suppressed.append(make_action("stale_reengagement_suppressed", p, "No eligible email/SMS channel or missing consent", users))

    seen_agent = set()
    for p in agent_people:
        pid = p.get("id")
        if pid in seen_agent:
            continue
        seen_agent.add(pid)
        reason_excluded = is_excluded(p, rules)
        if reason_excluded or p.get("assignedPondId") or not p.get("assignedUserId"):
            continue
        contact = best_contact_dt(p)
        if not contact or contact <= now - timedelta(days=int(rules.get("agent_followup_days", 14))):
            actions.append(make_action("agent_followup_reminder", p, f"Assigned agent has no contact/activity for {days_since(contact)} days", users))

    for p in recent_people:
        reason_excluded = is_excluded(p, rules)
        if reason_excluded:
            continue
        created = created_dt(p)
        if not created:
            continue
        age_min = business_minutes_elapsed(created, now, rules)
        if age_min < int(rules.get("new_lead_warning_minutes", 30)):
            continue
        contact = best_contact_dt(p)
        touched = bool(contact and contact > created + timedelta(minutes=1))
        if touched:
            continue
        if age_min >= int(rules.get("new_lead_reassign_minutes", 60)):
            actions.append(make_action("new_lead_reassign_to_peter", p, f"New lead appears untouched for {round(age_min, 1)} minutes; would reassign to Peter Allen user ID {rules.get('peter_user_id')}", users))
        else:
            actions.append(make_action("new_lead_30_min_warning", p, f"New lead appears untouched for {round(age_min, 1)} minutes; would warn assigned agent", users))

    actions_sorted = sorted(actions, key=lambda x: (str(x["action_type"]), str(x.get("days_since_contact_or_activity") or 0)), reverse=True)
    result = {
        "generated_at": now.isoformat(),
        "dry_run": True,
        "rules_summary": {
            "stale_no_contact_days": rules.get("stale_no_contact_days"),
            "agent_followup_days": rules.get("agent_followup_days"),
            "new_lead_warning_minutes": rules.get("new_lead_warning_minutes"),
            "new_lead_reassign_minutes": rules.get("new_lead_reassign_minutes"),
            "new_lead_timer_mode": rules.get("new_lead_timer_mode"),
            "business_hours_start": rules.get("business_hours_start"),
            "business_hours_end": rules.get("business_hours_end"),
            "business_hours_days": rules.get("business_hours_days"),
            "local_timezone": rules.get("local_timezone"),
            "peter_user_id": rules.get("peter_user_id"),
            "excluded_stages": rules.get("excluded_stages"),
            "stale_stages": rules.get("stale_stages"),
        },
        "counts": {
            "users": len(users),
            "stale_people_scanned": len(stale_people),
            "agent_people_scanned": len(agent_people),
            "recent_people_scanned": len(recent_people),
            "proposed_actions": len(actions_sorted),
            "suppressed_candidates": len(suppressed),
        },
        "action_counts": {},
        "actions": actions_sorted,
        "suppressed_sample": suppressed[:50],
    }
    for a in actions_sorted:
        result["action_counts"][a["action_type"]] = result["action_counts"].get(a["action_type"], 0) + 1
    return result


def write_outputs(result: dict) -> None:
    REPORT_JSON.write_text(json.dumps(result, indent=2), encoding="utf-8")
    fields = [
        "action_type", "person_id", "lead_name", "stage", "assigned_user_id", "assigned_user_name",
        "assigned_pond_id", "email_present", "phone_present", "proposed_channels", "tags",
        "last_contact_or_activity", "days_since_contact_or_activity", "created", "lead_age_minutes", "reason", "dry_run_result"
    ]
    with REPORT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in result["actions"]:
            writer.writerow(row)

    lines = []
    lines.append("# Follow Up Boss Dry-Run Scan Report\n")
    lines.append(f"Generated: {result['generated_at']}\n")
    lines.append("> This was a no-action dry run. No emails, texts, tasks, notes, notifications, or lead reassignments were created.\n")
    lines.append("## Summary\n")
    lines.append("| Metric | Count |\n| --- | ---: |")
    for key, value in result["counts"].items():
        lines.append(f"| {key.replace('_', ' ').title()} | {value} |")
    lines.append("\n## Proposed Action Counts\n")
    lines.append("| Proposed action | Count |\n| --- | ---: |")
    if result["action_counts"]:
        for key, value in sorted(result["action_counts"].items()):
            lines.append(f"| {key.replace('_', ' ').title()} | {value} |")
    else:
        lines.append("| None | 0 |")
    lines.append("\n## Proposed Actions\n")
    lines.append("| Action | Lead | Stage | Agent | Days Since Contact/Activity | Reason |\n| --- | --- | --- | --- | ---: | --- |")
    for row in result["actions"][:200]:
        lines.append(
            f"| {row.get('action_type','')} | {row.get('lead_name','')} (ID {row.get('person_id','')}) | {row.get('stage','')} | {row.get('assigned_user_name','')} | {row.get('days_since_contact_or_activity','')} | {str(row.get('reason','')).replace('|','/')} |"
        )
    if len(result["actions"]) > 200:
        lines.append(f"\nOnly the first 200 actions are shown here. See CSV for all {len(result['actions'])} actions.\n")
    lines.append("\n## Rules Used\n")
    lines.append("| Rule | Value |\n| --- | --- |")
    for key, value in result["rules_summary"].items():
        lines.append(f"| {key} | {json.dumps(value)} |")
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    key = os.environ.get("FUB_API_KEY") or getpass.getpass("Paste FUB API key for no-action dry-run scan: ").strip()
    if not key:
        raise SystemExit("Missing FUB API key")
    result = scan(key)
    write_outputs(result)
    print(json.dumps({
        "dry_run": True,
        "counts": result["counts"],
        "action_counts": result["action_counts"],
        "report_md": str(REPORT_MD),
        "report_csv": str(REPORT_CSV),
        "report_json": str(REPORT_JSON),
    }, indent=2))


if __name__ == "__main__":
    main()
