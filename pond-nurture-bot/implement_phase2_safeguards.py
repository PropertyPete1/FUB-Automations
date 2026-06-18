from pathlib import Path

root = Path('/home/ubuntu/fub_automation')
main_path = root / 'src/fub_automation/main.py'
rules_path = root / 'config/rules.yaml'

main = main_path.read_text()

# Extend Rules dataclass.
main = main.replace(
"""    customer_nurture_note_city_lookup_enabled: bool
    customer_nurture_log_note_enabled: bool
""",
"""    customer_nurture_note_city_lookup_enabled: bool
    customer_nurture_log_note_enabled: bool
    phase2_daily_summary_enabled: bool
    phase2_daily_summary_email: str
    phase2_max_customer_emails_per_run: int
    phase2_max_reassignments_per_run: int
    phase2_manual_suppression_tags: List[str]
    stale_reassignment_excluded_stages: List[str]
"""
)

main = main.replace(
"""            customer_nurture_note_city_lookup_enabled=bool(data.get("customer_nurture_note_city_lookup_enabled", True)),
            customer_nurture_log_note_enabled=bool(data.get("customer_nurture_log_note_enabled", False)),
""",
"""            customer_nurture_note_city_lookup_enabled=bool(data.get("customer_nurture_note_city_lookup_enabled", True)),
            customer_nurture_log_note_enabled=bool(data.get("customer_nurture_log_note_enabled", False)),
            phase2_daily_summary_enabled=bool(data.get("phase2_daily_summary_enabled", True)),
            phase2_daily_summary_email=data.get("phase2_daily_summary_email") or data.get("owner_email", "peter@lifestyledesignrealty.com"),
            phase2_max_customer_emails_per_run=int(data.get("phase2_max_customer_emails_per_run", 25)),
            phase2_max_reassignments_per_run=int(data.get("phase2_max_reassignments_per_run", 25)),
            phase2_manual_suppression_tags=data.get("phase2_manual_suppression_tags", ["Do Not Nurture", "No AI Email"]),
            stale_reassignment_excluded_stages=data.get("stale_reassignment_excluded_stages", ["Hot Prospect", "Active Client", "Pending", "Closed", "Past Client", "Sphere", "Trash"]),
"""
)

# Add AuditDB recent_rows helper.
main = main.replace(
"""    def get_last_reengagement(self, person_id: int) -> Optional[dt.datetime]:
        with self.connect() as con:
            row = con.execute("SELECT last_sent_at FROM reengagement_log WHERE person_id=?", (person_id,)).fetchone()
        return parse_dt(row[0]) if row else None
""",
"""    def recent_audit_rows(self, actions: Iterable[str], since: dt.datetime) -> List[dict]:
        placeholders = ",".join("?" for _ in actions)
        if not placeholders:
            return []
        query = f"SELECT created_at, person_id, action, status, details FROM audit_log WHERE action IN ({placeholders}) AND created_at >= ? ORDER BY created_at DESC"
        with self.connect() as con:
            con.row_factory = sqlite3.Row
            rows = con.execute(query, [*actions, since.isoformat()]).fetchall()
        return [dict(row) for row in rows]

    def get_last_reengagement(self, person_id: int) -> Optional[dt.datetime]:
        with self.connect() as con:
            row = con.execute("SELECT last_sent_at FROM reengagement_log WHERE person_id=?", (person_id,)).fetchone()
        return parse_dt(row[0]) if row else None
"""
)

# Return freshness angle metadata.
main = main.replace(
"""        return json.loads(response.choices[0].message.content)
""",
"""        generated = json.loads(response.choices[0].message.content)
        generated["freshness_angle"] = angle
        return generated
"""
)

# Modify run_daily_scans to send summary after Phase 2 scans.
main = main.replace(
"""    def run_daily_scans(self) -> None:
        self.scan_stale_agent_no_note_reassignment()
        self.scan_stale_leads()
        self.scan_agent_followup()
""",
"""    def run_daily_scans(self) -> None:
        self.scan_stale_agent_no_note_reassignment()
        self.scan_stale_leads()
        self.scan_agent_followup()
        self.send_phase2_daily_summary()
"""
)

# Replace scan_stale_leads with capped version.
main = main.replace(
"""    def scan_stale_leads(self) -> None:
        if not self.rules.customer_reengagement_emails_enabled:
            LOGGER.info("Customer pond nurture email scan is disabled by rules.yaml")
            return
        params = {"fields": "allFields"}
        if not self.rules.pond_nurture_only:
            cutoff = (dt.datetime.now(UTC) - dt.timedelta(days=self.rules.stale_no_contact_days)).strftime("%Y-%m-%d %H:%M:%S")
            params["lastActivityBefore"] = cutoff
        candidates = self.fub.get_people(**params)
        for person in candidates:
            try:
                self.process_reengagement_candidate(person)
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("pond nurture failed for person %s", person.get("id"))
                self.db.log("pond_nurture", "error", person.get("id"), {"error": str(exc)})
""",
"""    def scan_stale_leads(self) -> None:
        if not self.rules.customer_reengagement_emails_enabled:
            LOGGER.info("Customer pond nurture email scan is disabled by rules.yaml")
            return
        params = {"fields": "allFields"}
        if not self.rules.pond_nurture_only:
            cutoff = (dt.datetime.now(UTC) - dt.timedelta(days=self.rules.stale_no_contact_days)).strftime("%Y-%m-%d %H:%M:%S")
            params["lastActivityBefore"] = cutoff
        candidates = self.fub.get_people(**params)
        sent_count = 0
        cap = max(0, int(self.rules.phase2_max_customer_emails_per_run))
        for person in candidates:
            if cap and sent_count >= cap:
                self.db.log("pond_nurture", "launch_cap_reached", None, {"cap": cap})
                break
            try:
                status = self.process_reengagement_candidate(person)
                if status == "sent":
                    sent_count += 1
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("pond nurture failed for person %s", person.get("id"))
                self.db.log("pond_nurture", "error", person.get("id"), {"error": str(exc)})
"""
)

# Replace stale reassignment scan with capped version.
main = main.replace(
"""    def scan_stale_agent_no_note_reassignment(self) -> None:
        if not self.rules.stale_agent_no_note_reassignment_enabled:
            LOGGER.info("20-day stale-agent pond reassignment is disabled by rules.yaml")
            return
        if not self.rules.stale_agent_reassign_pond_id:
            LOGGER.warning("20-day stale-agent pond reassignment requested but stale_agent_reassign_pond_id is missing")
            return
        cutoff = (dt.datetime.now(UTC) - dt.timedelta(days=self.rules.stale_agent_no_note_days)).strftime("%Y-%m-%d %H:%M:%S")
        candidates = self.fub.get_people(lastActivityBefore=cutoff, fields="allFields")
        for person in candidates:
            try:
                self.process_stale_agent_no_note_candidate(person)
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("stale-agent reassignment check failed for person %s", person.get("id"))
                self.db.log("stale_agent_pond_reassignment", "error", person.get("id"), {"error": str(exc)})
""",
"""    def scan_stale_agent_no_note_reassignment(self) -> None:
        if not self.rules.stale_agent_no_note_reassignment_enabled:
            LOGGER.info("20-day stale-agent pond reassignment is disabled by rules.yaml")
            return
        if not self.rules.stale_agent_reassign_pond_id:
            LOGGER.warning("20-day stale-agent pond reassignment requested but stale_agent_reassign_pond_id is missing")
            return
        cutoff = (dt.datetime.now(UTC) - dt.timedelta(days=self.rules.stale_agent_no_note_days)).strftime("%Y-%m-%d %H:%M:%S")
        candidates = self.fub.get_people(lastActivityBefore=cutoff, fields="allFields")
        reassigned_count = 0
        cap = max(0, int(self.rules.phase2_max_reassignments_per_run))
        for person in candidates:
            if cap and reassigned_count >= cap:
                self.db.log("stale_agent_pond_reassignment", "launch_cap_reached", None, {"cap": cap})
                break
            try:
                status = self.process_stale_agent_no_note_candidate(person)
                if status == "completed":
                    reassigned_count += 1
            except Exception as exc:  # noqa: BLE001
                LOGGER.exception("stale-agent reassignment check failed for person %s", person.get("id"))
                self.db.log("stale_agent_pond_reassignment", "error", person.get("id"), {"error": str(exc)})
"""
)

# Replace process_reengagement_candidate returning status and logging metadata.
main = main.replace(
"""    def process_reengagement_candidate(self, person: dict) -> None:
        person_id = int(person["id"])
        if self.is_excluded(person):
            self.db.log("pond_nurture", "suppressed", person_id, {"reason": "excluded stage/tag"})
            return
        if not self.qualifies_for_reengagement(person):
            self.db.log("pond_nurture", "suppressed", person_id, {"reason": "not in configured pond"})
            return
        last = self.db.get_last_reengagement(person_id)
        if last and dt.datetime.now(UTC) - last < dt.timedelta(days=self.rules.reengagement_cadence_days):
            self.db.log("pond_nurture", "skipped", person_id, {"reason": "14-day cadence cap"})
            return
        emails = person.get("emails") or []
        city, lead_context = self.customer_nurture_context(person)
        market_context = self.market.get(city) if city else ""
        generated = self.content.generate(person, city or "Texas", market_context, lead_context)
        sent_channels = []
        if self.rules.email_outreach_enabled and emails and not self.has_any_tag(person, self.rules.email_opt_out_tags):
            sender_email = self.rules.owner_email
            to_email = emails[0].get("value") or emails[0].get("email")
            if to_email:
                self.email.send(
                    to_email,
                    generated["subject"],
                    append_email_footer(generated["email_body"], self.rules),
                    from_email=sender_email,
                    reply_to=sender_email,
                )
                sent_channels.append("email")
        if sent_channels:
            if self.rules.customer_nurture_log_note_enabled:
                self.fub.add_note(person_id, "Peter sent pond nurture email", f"Sent two-week pond nurture email. City focus: {city or 'Texas/general'}.")
            self.db.upsert_reengagement(person_id, "+".join(sent_channels), city or "Texas/general", json.dumps(generated))
            self.db.log("pond_nurture", "sent", person_id, {"channels": sent_channels, "city": city or "Texas/general"})
        else:
            self.db.log("pond_nurture", "suppressed", person_id, {"reason": "no eligible email channel or email outreach disabled"})
""",
"""    def process_reengagement_candidate(self, person: dict) -> str:
        person_id = int(person["id"])
        if self.is_excluded(person) or self.has_any_tag(person, self.rules.phase2_manual_suppression_tags):
            self.db.log("pond_nurture", "suppressed", person_id, {"reason": "excluded stage/tag or manual suppression tag"})
            return "suppressed"
        if not self.qualifies_for_reengagement(person):
            self.db.log("pond_nurture", "suppressed", person_id, {"reason": "not in configured pond"})
            return "suppressed"
        last = self.db.get_last_reengagement(person_id)
        if last and dt.datetime.now(UTC) - last < dt.timedelta(days=self.rules.reengagement_cadence_days):
            self.db.log("pond_nurture", "skipped", person_id, {"reason": "14-day cadence cap"})
            return "skipped"
        emails = person.get("emails") or []
        city, lead_context, city_source = self.customer_nurture_context(person)
        market_context = self.market.get(city) if city else ""
        generated = self.content.generate(person, city or "Texas", market_context, lead_context)
        sent_channels = []
        if self.rules.email_outreach_enabled and emails and not self.has_any_tag(person, self.rules.email_opt_out_tags):
            sender_email = self.rules.owner_email
            to_email = emails[0].get("value") or emails[0].get("email")
            if to_email:
                self.email.send(
                    to_email,
                    generated["subject"],
                    append_email_footer(generated["email_body"], self.rules),
                    from_email=sender_email,
                    reply_to=sender_email,
                )
                sent_channels.append("email")
        if sent_channels:
            if self.rules.customer_nurture_log_note_enabled:
                self.fub.add_note(person_id, "Peter sent pond nurture email", f"Sent two-week pond nurture email. City focus: {city or 'Texas/general'}.")
            self.db.upsert_reengagement(person_id, "+".join(sent_channels), city or "Texas/general", json.dumps(generated))
            self.db.log("pond_nurture", "sent", person_id, {
                "channels": sent_channels,
                "city": city or "Texas/general",
                "city_source": city_source,
                "freshness_angle": generated.get("freshness_angle"),
                "subject": generated.get("subject"),
            })
            return "sent"
        self.db.log("pond_nurture", "suppressed", person_id, {"reason": "no eligible email channel or email outreach disabled"})
        return "suppressed"
"""
)

# Replace reassignment candidate with special exclusions and return status.
main = main.replace(
"""    def process_stale_agent_no_note_candidate(self, person: dict) -> None:
        person_id = int(person["id"])
        if self.is_excluded(person) or person.get("assignedPondId"):
            return
        if not person.get("assignedUserId"):
            return
        notes = self.safe_get_notes(person_id)
        if self.has_recent_note(notes, self.rules.stale_agent_no_note_days):
            self.db.log("stale_agent_pond_reassignment", "skipped", person_id, {"reason": "recent note found"})
            return
        pond_id = int(self.rules.stale_agent_reassign_pond_id)
        self.fub.assign_to_pond(person_id, pond_id)
        self.db.log("stale_agent_pond_reassignment", "completed", person_id, {"assignedPondId": pond_id, "days_without_note": self.rules.stale_agent_no_note_days})
""",
"""    def process_stale_agent_no_note_candidate(self, person: dict) -> str:
        person_id = int(person["id"])
        stage = str(person.get("stage", ""))
        if stage.lower() in {s.lower() for s in self.rules.stale_reassignment_excluded_stages}:
            self.db.log("stale_agent_pond_reassignment", "suppressed", person_id, {"reason": "protected stage", "stage": stage})
            return "suppressed"
        if self.is_excluded(person) or self.has_any_tag(person, self.rules.phase2_manual_suppression_tags) or person.get("assignedPondId"):
            self.db.log("stale_agent_pond_reassignment", "suppressed", person_id, {"reason": "excluded/manual suppression/already in pond"})
            return "suppressed"
        if not person.get("assignedUserId"):
            self.db.log("stale_agent_pond_reassignment", "suppressed", person_id, {"reason": "no assigned agent"})
            return "suppressed"
        notes = self.safe_get_notes(person_id)
        if self.has_recent_note(notes, self.rules.stale_agent_no_note_days):
            self.db.log("stale_agent_pond_reassignment", "skipped", person_id, {"reason": "recent note found"})
            return "skipped"
        pond_id = int(self.rules.stale_agent_reassign_pond_id)
        self.fub.assign_to_pond(person_id, pond_id)
        self.db.log("stale_agent_pond_reassignment", "completed", person_id, {
            "assignedPondId": pond_id,
            "days_without_note": self.rules.stale_agent_no_note_days,
            "reason": f"No qualifying FUB note found in {self.rules.stale_agent_no_note_days}+ days; reassigned to Lead Pond by approved Phase 2 automation.",
            "previous_assigned_user_id": person.get("assignedUserId"),
            "stage": stage,
        })
        return "completed"
"""
)

# Replace customer context tuple with city source.
main = main.replace(
"""    def customer_nurture_context(self, person: dict) -> Tuple[str, str]:
        notes: List[dict] = []
        note_text = ""
        if self.rules.customer_nurture_note_city_lookup_enabled:
            notes = self.safe_get_notes(int(person["id"]))
            note_text = " ".join(str(n.get("body") or n.get("text") or n.get("note") or "") for n in notes[:25])
        city = infer_city_from_text(note_text, self.rules.target_cities) or infer_city(person, self.rules.target_cities)
        lead_context = summarize_lead_context_from_notes(notes, city, self.rules.target_cities)
        return city, lead_context

    def city_for_customer_nurture(self, person: dict) -> str:
        city, _ = self.customer_nurture_context(person)
        return city
""",
"""    def customer_nurture_context(self, person: dict) -> Tuple[str, str, str]:
        notes: List[dict] = []
        note_text = ""
        note_city = ""
        if self.rules.customer_nurture_note_city_lookup_enabled:
            notes = self.safe_get_notes(int(person["id"]))
            note_text = " ".join(str(n.get("body") or n.get("text") or n.get("note") or "") for n in notes[:25])
            note_city = infer_city_from_text(note_text, self.rules.target_cities)
        field_city = infer_city(person, self.rules.target_cities)
        city = note_city or field_city
        city_source = "fub_notes" if note_city else ("lead_fields" if field_city else "texas_fallback")
        lead_context = summarize_lead_context_from_notes(notes, city, self.rules.target_cities)
        return city, lead_context, city_source

    def city_for_customer_nurture(self, person: dict) -> str:
        city, _, _ = self.customer_nurture_context(person)
        return city
"""
)

# Insert summary method before business_minutes_elapsed.
main = main.replace(
"""    def user_cache_by_id(self) -> Dict[int, dict]:
        if self._user_cache_by_id is None:
            self._user_cache_by_id = {int(u["id"]): u for u in self.fub.users() if u.get("id") is not None}
        return self._user_cache_by_id

    def business_minutes_elapsed(self, start_utc: dt.datetime, end_utc: dt.datetime) -> float:
""",
"""    def user_cache_by_id(self) -> Dict[int, dict]:
        if self._user_cache_by_id is None:
            self._user_cache_by_id = {int(u["id"]): u for u in self.fub.users() if u.get("id") is not None}
        return self._user_cache_by_id

    def send_phase2_daily_summary(self) -> None:
        if not self.rules.phase2_daily_summary_enabled:
            return
        if not (self.rules.customer_reengagement_emails_enabled or self.rules.stale_agent_no_note_reassignment_enabled):
            return
        since = dt.datetime.now(UTC) - dt.timedelta(hours=24)
        rows = self.db.recent_audit_rows(["pond_nurture", "stale_agent_pond_reassignment"], since)
        if not rows:
            return
        counts: Dict[Tuple[str, str], int] = {}
        examples: List[str] = []
        for row in rows:
            key = (str(row.get("action")), str(row.get("status")))
            counts[key] = counts.get(key, 0) + 1
            if len(examples) < 20 and row.get("status") in {"sent", "completed", "error", "launch_cap_reached"}:
                try:
                    details = json.loads(row.get("details") or "{}")
                except Exception:  # noqa: BLE001
                    details = {}
                person_id = row.get("person_id") or "run"
                summary_bits = []
                for name in ("city", "city_source", "freshness_angle", "reason", "stage"):
                    if details.get(name):
                        summary_bits.append(f"{name}={details.get(name)}")
                examples.append(f"- {row.get('action')} {row.get('status')} — FUB ID {person_id}" + (f" — {'; '.join(summary_bits)}" if summary_bits else ""))
        lines = [
            "Hi Peter,",
            "",
            "Here is the Phase 2 pond nurture and reassignment summary from the last 24 hours.",
            "",
            "Counts:",
        ]
        for (action, status), count in sorted(counts.items()):
            lines.append(f"- {action} / {status}: {count}")
        if examples:
            lines.extend(["", "Notable items:", *examples])
        lines.extend([
            "",
            "SMS remains disabled. Customer nurture emails are capped per run during launch, and reassignment excludes protected stages plus manual suppression tags.",
            "",
            "Peter",
        ])
        self.email.send(
            to_email=self.rules.phase2_daily_summary_email,
            subject="Phase 2 FUB automation daily summary",
            body="\n".join(lines),
            from_email=self.rules.owner_email,
            reply_to=self.rules.owner_email,
        )
        self.db.log("phase2_daily_summary", "sent", None, {"to": self.rules.phase2_daily_summary_email, "row_count": len(rows)})

    def business_minutes_elapsed(self, start_utc: dt.datetime, end_utc: dt.datetime) -> float:
"""
)

main_path.write_text(main)

rules = rules_path.read_text()
# Enable live-approved Phase 2, keep SMS disabled, and add safeguards if not present.
rules = rules.replace('customer_reengagement_emails_enabled: false', 'customer_reengagement_emails_enabled: true')
rules = rules.replace('stale_agent_no_note_reassignment_enabled: false', 'stale_agent_no_note_reassignment_enabled: true')
rules = rules.replace('customer_sender_policy: "peter_only_phase1"', 'customer_sender_policy: "peter_only_phase2_live_approved"')
if 'phase2_daily_summary_enabled:' not in rules:
    insert_after = 'customer_nurture_log_note_enabled: false\n'
    addition = '''phase2_daily_summary_enabled: true
phase2_daily_summary_email: "peter@lifestyledesignrealty.com"
# Conservative approved launch caps; set to 0 for unlimited after Peter reviews first runs.
phase2_max_customer_emails_per_run: 25
phase2_max_reassignments_per_run: 25
phase2_manual_suppression_tags:
  - "Do Not Nurture"
  - "No AI Email"
  - "Do Not Email"
  - "Manual Review"
stale_reassignment_excluded_stages:
  - "Hot Prospect"
  - "Active Client"
  - "Pending"
  - "Closed"
  - "Past Client"
  - "Sphere"
  - "Trash"
'''
    rules = rules.replace(insert_after, insert_after + addition)
# Ensure suppression tags are also in global exclusions.
for tag in ['do not nurture', 'no ai email', 'do not email', 'manual review']:
    if f'  - "{tag}"' not in rules and f'  - "{tag.title()}"' not in rules:
        marker = '  - "dnc"\n'
        rules = rules.replace(marker, marker + f'  - "{tag}"\n')

rules_path.write_text(rules)

# Create live Phase 2 runner.
runner = root / 'run_phase2_pond_nurture_live.py'
runner.write_text('''#!/usr/bin/env python3
"""Run approved Phase 2 FUB pond nurture and 20-day stale-agent reassignment.

This runner intentionally keeps SMS and new-lead automation out of scope. It runs
only customer pond nurture, stale-agent reassignment to Lead Pond, and the Phase 2
summary email after scans complete.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path


def load_dotenv(path: str = '.env') -> None:
    env_path = Path(path)
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(errors='ignore').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if value.startswith('${') and value.endswith('}'):
            value = os.environ.get(value[2:-1], value)
        os.environ[key] = value


def main() -> int:
    parser = argparse.ArgumentParser(description='Run approved Phase 2 pond nurture and stale-agent reassignment.')
    parser.add_argument('--dry-run', action='store_true', help='Force dry-run mode regardless of .env')
    args = parser.parse_args()

    load_dotenv()
    if args.dry_run:
        os.environ['DRY_RUN'] = 'true'
    os.environ['FUB_DISABLE_SCHEDULER'] = 'true'

    from src.fub_automation.main import AuditDB, FollowUpBossClient, RuleEngine, Rules, Settings

    settings = Settings.from_env()
    rules = Rules.load(settings.rules_path)

    if not rules.customer_reengagement_emails_enabled:
        print('Safety check failed: customer pond nurture emails are disabled in rules.yaml. No action taken.')
        return 2
    if not rules.stale_agent_no_note_reassignment_enabled:
        print('Safety check failed: stale-agent reassignment is disabled in rules.yaml. No action taken.')
        return 2
    if rules.sms_outreach_enabled:
        print('Safety check failed: SMS outreach is enabled. No action taken.')
        return 2
    if rules.new_lead_warning_enabled or rules.new_lead_reassignment_enabled:
        print('Safety check failed: new-lead warning/reassignment flags are enabled. No action taken.')
        return 2
    if not settings.fub_api_key:
        print('Safety check failed: FUB_API_KEY is missing. No action taken.')
        return 2
    if not settings.dry_run and not all([settings.smtp_host, settings.smtp_user, settings.smtp_password, settings.email_from]):
        print('Safety check failed: SMTP settings are incomplete for live sending. No action taken.')
        return 2

    db = AuditDB(settings.database_path)
    fub = FollowUpBossClient(settings)
    engine = RuleEngine(settings, rules, fub, db)
    print(f'Running approved Phase 2. dry_run={settings.dry_run}; email_cap={rules.phase2_max_customer_emails_per_run}; reassignment_cap={rules.phase2_max_reassignments_per_run}')
    engine.scan_stale_agent_no_note_reassignment()
    engine.scan_stale_leads()
    engine.send_phase2_daily_summary()
    print('Phase 2 run completed.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
''')
runner.chmod(0o755)
print('Phase 2 safeguards implemented.')
