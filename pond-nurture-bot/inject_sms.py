"""
Inject pond nurture SMS block into process_reengagement_candidate
and add _check_mysql_sms_today helper method to RuleEngine class.
"""
import re

with open("/home/ubuntu/fub_automation/src/fub_automation/main.py", "r", encoding="utf-8") as f:
    content = f.read()

# ── Edit 3: Replace the email-only block with email+SMS block ──────────────────
old_block = (
    'sent_channels.append("email")\n'
    '        if sent_channels:\n'
    '            # Peter requested notes on EVERYTHING to lead by example\n'
    '            try:\n'
    '                self.fub.add_note(\n'
    '                    person_id, \n'
    '                    "Pond Nurture Email Sent", \n'
    '                    f"Automated two-week pond nurture email sent.\\n\\n"\n'
    '                    f"\u2022 City focus: {city or \'Texas/general\'}\\n"\n'
    '                    f"\u2022 Subject: \\"{generated.get(\'subject\')}\\"\\n"\n'
    '                    f"\u2022 Source: {city_source}"\n'
    '                )\n'
    '            except Exception as note_exc:\n'
    '                LOGGER.warning("Failed to log pond nurture FUB note for person %s: %s", person_id, note_exc)\n'
    '                \n'
    '            self.db.upsert_reengagement(person_id, "+".join(sent_channels), city or "Texas/general", json.dumps(generated))\n'
    '            self.db.log("pond_nurture", "sent", person_id, {\n'
    '                "channels": sent_channels,\n'
    '                "city": city or "Texas/general",\n'
    '                "city_source": city_source,\n'
    '                "freshness_angle": generated.get("freshness_angle"),\n'
    '                "subject": generated.get("subject"),\n'
    '            })\n'
    '            return "sent"'
)

new_block = (
    'sent_channels.append("email")\n'
    '        # Send FUB native SMS alongside email if enabled and lead has a phone number\n'
    '        if self.rules.pond_nurture_sms_enabled and not self.has_any_tag(person, self.rules.sms_opt_out_tags):\n'
    '            phones = person.get("phones") or []\n'
    '            to_number = None\n'
    '            for ph in phones:\n'
    '                val = ph.get("value") or ph.get("phone") or ""\n'
    '                if val:\n'
    '                    to_number = re.sub(r"[^\\d]", "", val)\n'
    '                    break\n'
    '            if to_number and len(to_number) >= 10:\n'
    '                # Deduplication: skip if Lifestyle Bot already texted this lead today\n'
    '                already_texted = self._check_mysql_sms_today(person_id)\n'
    '                if not already_texted:\n'
    '                    sms_body = (\n'
    '                        generated.get("sms_body")\n'
    '                        or f"Hi, it\'s Peter with Lifestyle Design Realty! {generated.get(\'subject\', \'Checking in on your real estate goals\')}. Reply anytime \u2014 I\'m here to help!"\n'
    '                    )\n'
    '                    try:\n'
    '                        self.fub.log_text_message(person_id, sms_body, to_number, self.rules.pond_nurture_sms_from_number)\n'
    '                        sent_channels.append("sms")\n'
    '                        self.db.log("pond_nurture", "sms_sent", person_id, {"to_last4": to_number[-4:]})\n'
    '                    except Exception as sms_exc:\n'
    '                        LOGGER.warning("Pond nurture SMS failed for person %s: %s", person_id, sms_exc)\n'
    '        if sent_channels:\n'
    '            # Peter requested notes on EVERYTHING to lead by example\n'
    '            note_channels = " + ".join(c.upper() for c in sent_channels)\n'
    '            try:\n'
    '                self.fub.add_note(\n'
    '                    person_id,\n'
    '                    f"Pond Nurture {note_channels} Sent",\n'
    '                    f"Automated two-week pond nurture outreach sent.\\n\\n"\n'
    '                    f"\u2022 Channels: {note_channels}\\n"\n'
    '                    f"\u2022 City focus: {city or \'Texas/general\'}\\n"\n'
    '                    f"\u2022 Subject: \\"{generated.get(\'subject\')}\\"\\n"\n'
    '                    f"\u2022 Source: {city_source}"\n'
    '                )\n'
    '            except Exception as note_exc:\n'
    '                LOGGER.warning("Failed to log pond nurture FUB note for person %s: %s", person_id, note_exc)\n'
    '            self.db.upsert_reengagement(person_id, "+".join(sent_channels), city or "Texas/general", json.dumps(generated))\n'
    '            self.db.log("pond_nurture", "sent", person_id, {\n'
    '                "channels": sent_channels,\n'
    '                "city": city or "Texas/general",\n'
    '                "city_source": city_source,\n'
    '                "freshness_angle": generated.get("freshness_angle"),\n'
    '                "subject": generated.get("subject"),\n'
    '            })\n'
    '            return "sent"'
)

if old_block not in content:
    print("ERROR: Edit 3 target not found! Dumping context around line 2223...")
    lines = content.split("\n")
    for i, line in enumerate(lines[2218:2250], start=2219):
        print(f"{i}: {repr(line)}")
    exit(1)

content = content.replace(old_block, new_block, 1)
print("Edit 3 applied: SMS send block injected into process_reengagement_candidate")

# ── Edit 4: Add _check_mysql_sms_today helper before process_stale_agent_no_note_candidate ──
helper_method = '''
    def _check_mysql_sms_today(self, person_id: int) -> bool:
        """Check if Lifestyle Bot already texted this lead today via MySQL sms_sent_today table.

        Returns True if already texted (skip), False if safe to text.
        Falls back to False (allow text) if MySQL is unavailable.
        """
        try:
            import mysql.connector
            from urllib.parse import urlparse
            db_url = os.environ.get("DATABASE_URL", "")
            if not db_url:
                return False
            parsed = urlparse(db_url)
            # Determine today's date in CT timezone
            try:
                from zoneinfo import ZoneInfo
                ct_tz = ZoneInfo("America/Chicago")
            except Exception:
                ct_tz = None
            if ct_tz:
                today_ct = dt.datetime.now(ct_tz).strftime("%Y-%m-%d")
            else:
                today_ct = dt.datetime.utcnow().strftime("%Y-%m-%d")
            conn = mysql.connector.connect(
                host=parsed.hostname,
                port=parsed.port or 3306,
                user=parsed.username,
                password=parsed.password,
                database=parsed.path.lstrip("/"),
                connect_timeout=5,
            )
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT 1 FROM sms_sent_today WHERE lead_id = %s AND sent_date = %s LIMIT 1",
                    (person_id, today_ct),
                )
                row = cursor.fetchone()
                return row is not None
            finally:
                conn.close()
        except Exception as exc:
            LOGGER.debug("_check_mysql_sms_today: MySQL unavailable, allowing text for person %s: %s", person_id, exc)
            return False

'''

insert_before = '    def process_stale_agent_no_note_candidate(self, person: dict) -> str:'
if insert_before not in content:
    print("ERROR: Edit 4 anchor not found!")
    exit(1)

content = content.replace(insert_before, helper_method + insert_before, 1)
print("Edit 4 applied: _check_mysql_sms_today helper added to RuleEngine")

with open("/home/ubuntu/fub_automation/src/fub_automation/main.py", "w", encoding="utf-8") as f:
    f.write(content)

print("File saved successfully.")
