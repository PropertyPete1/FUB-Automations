#!/usr/bin/env python3
"""
LDR Unified Nightly Health Check Analysis
Runs from the Manus sandbox when the cloud computer's nightly_health.py
cannot be directly executed.
"""
import json
import datetime
import sys

# Load data files
def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        return {"error": str(e)}

observations_raw = load_json("/tmp/observations.json")
bot_status_raw = load_json("/tmp/bot_status.json")
monitor_status_raw = load_json("/tmp/monitor_status.json")
bot_run_history_raw = load_json("/tmp/bot_run_history.json")
audit_status_raw = load_json("/tmp/audit_status.json")

# Parse observations
observations = observations_raw.get("result", {}).get("data", {}).get("json", [])
bot_status = bot_status_raw.get("result", {}).get("data", {}).get("json", {})
monitor_runs = monitor_status_raw.get("result", {}).get("data", {}).get("json", [])
bot_runs = bot_run_history_raw.get("result", {}).get("data", {}).get("json", [])
audit_status = audit_status_raw.get("result", {}).get("data", {}).get("json", {})

now = datetime.datetime.utcnow()
cutoff = now - datetime.timedelta(hours=25)

# Filter observations to last 25 hours
recent_obs = []
for obs in observations:
    try:
        ts = datetime.datetime.fromisoformat(obs["createdAt"].replace("Z", "+00:00")).replace(tzinfo=None)
        if ts >= cutoff:
            recent_obs.append(obs)
    except:
        recent_obs.append(obs)

# Categorize by severity
errors = [o for o in recent_obs if o.get("severity") == "error"]
warnings = [o for o in recent_obs if o.get("severity") == "warning"]
infos = [o for o in recent_obs if o.get("severity") == "info"]

print("=" * 70)
print("LDR UNIFIED NIGHTLY HEALTH CHECK REPORT")
print(f"Generated: {now.strftime('%Y-%m-%d %H:%M:%S')} UTC (4:00 AM CT)")
print("=" * 70)

# 1. Overall Status
total_issues = len(errors) + len(warnings)
if len(errors) > 0:
    overall = "CRITICAL — ERRORS DETECTED"
elif len(warnings) > 0:
    overall = "WARNING — ATTENTION NEEDED"
else:
    overall = "HEALTHY — ALL SYSTEMS NOMINAL"

print(f"\nOVERALL STATUS: {overall}")
print(f"  Errors: {len(errors)} | Warnings: {len(warnings)} | Info: {len(infos)}")

# 2. Cloud Computer Status
print("\n" + "-" * 70)
print("CLOUD COMPUTER (Peter Allen's Cloud PC 2)")
print("-" * 70)
# Check for pond_nurture errors
pond_errors = [o for o in recent_obs if o.get("source") == "pond_nurture" and o.get("severity") == "error"]
if pond_errors:
    print(f"  ❌ POND NURTURE ERRORS: {len(pond_errors)}")
    for e in pond_errors[:3]:
        print(f"     - {e.get('message')}: {e.get('detail', '')[:120]}")
else:
    # Check for pond_nurture success
    pond_success = [o for o in recent_obs if o.get("source") == "pond_nurture" and o.get("severity") == "info"]
    if pond_success:
        print(f"  ✅ Pond Nurture: Ran successfully ({len(pond_success)} info observations)")
    else:
        print(f"  ⚠️  Pond Nurture: No observations in last 25h (may not have run yet today)")

# Check nightly healer
healer_warnings = [o for o in recent_obs if o.get("category") == "nightly_healer_last_ran"]
if healer_warnings:
    print(f"  ⚠️  NIGHTLY HEALER: {healer_warnings[0].get('detail', 'Has not run in 26+ hours')}")
else:
    healer_obs = [o for o in recent_obs if o.get("source") == "nightly_healer"]
    if healer_obs:
        print(f"  ✅ Nightly Healer: Ran (last: {healer_obs[0].get('createdAt', 'unknown')})")
    else:
        print(f"  ⚠️  Nightly Healer: No observations found")

# SQLite audit log errors (from cloud computer)
audit_errors = [o for o in recent_obs if o.get("category") in ["audit_log_error", "script_error"]]
if audit_errors:
    print(f"  ❌ AUDIT LOG ERRORS: {len(audit_errors)}")
    for e in audit_errors[:3]:
        print(f"     - {e.get('message')}: {e.get('detail', '')[:120]}")
else:
    print(f"  ✅ Audit Log: No errors detected")

# 3. WebDev Dashboard Bot Observations
print("\n" + "-" * 70)
print("WEBDEV DASHBOARD — BOT OBSERVATIONS (Last 25h)")
print("-" * 70)

# Bot Monitor
monitor_obs = [o for o in recent_obs if o.get("source") == "bot_monitor"]
if monitor_obs:
    latest_monitor = monitor_obs[0]
    print(f"  Bot Monitor: {latest_monitor.get('message', 'N/A')}")
    print(f"    Last run: {latest_monitor.get('createdAt', 'N/A')}")
    if latest_monitor.get("detail"):
        print(f"    Detail: {latest_monitor.get('detail', '')[:150]}")

# Lifestyle Bot
lifestyle_obs = [o for o in recent_obs if o.get("source") == "lifestyle_bot"]
if lifestyle_obs:
    latest_lb = lifestyle_obs[0]
    print(f"  Lifestyle Bot: {latest_lb.get('message', 'N/A')}")
    print(f"    Last run: {latest_lb.get('createdAt', 'N/A')}")
else:
    print(f"  ⚠️  Lifestyle Bot: No observations in last 25h")

# Reply intent scanner
reply_obs = [o for o in recent_obs if o.get("source") == "reply_intent"]
if reply_obs:
    print(f"  Reply Intent Scanner: {reply_obs[0].get('message', 'N/A')}")

# 4. Bot Status (SMS)
print("\n" + "-" * 70)
print("AGENT BOT STATUS (SMS Texts Today)")
print("-" * 70)
agents = bot_status.get("agents", [])
for agent in agents:
    name = agent.get("name", "?")
    today = agent.get("todayCount", 0)
    week = agent.get("weekCount", 0)
    goal = agent.get("goal", 15)
    is_bot = agent.get("isBot", False)
    bot_label = " [BOT]" if is_bot else ""
    print(f"  {name}{bot_label}: {today} today / {week} this week (goal: {goal}/day)")

# 5. Lifestyle Bot Run History
print("\n" + "-" * 70)
print("LIFESTYLE BOT RUN HISTORY (Recent)")
print("-" * 70)
for run in bot_runs[:3]:
    run_at = run.get("runAt", "?")
    texted = run.get("leadsTexted", 0)
    failed = run.get("leadsFailed", 0)
    summary = run.get("summary", "N/A")
    triggered = run.get("triggeredBy", "?")
    print(f"  {run_at}: {summary} (triggered by: {triggered})")

# 6. Bot Monitor Latest Run
print("\n" + "-" * 70)
print("BOT MONITOR LATEST RUN")
print("-" * 70)
if monitor_runs:
    latest = monitor_runs[0]
    print(f"  Run at: {latest.get('runAt', 'N/A')}")
    print(f"  Summary: {latest.get('summary', 'N/A')}")
    findings = latest.get("findings", [])
    issues = [f for f in findings if f.get("status") != "ok"]
    ok_count = len([f for f in findings if f.get("status") == "ok"])
    print(f"  Checks: {len(findings)} total, {ok_count} OK, {len(issues)} issues")
    for issue in issues:
        icon = "❌" if issue.get("status") == "error" else "⚠️"
        print(f"    {icon} {issue.get('check')}: {issue.get('detail', '')[:100]}")

# 7. All Errors Summary
if errors:
    print("\n" + "-" * 70)
    print("ALL ERRORS (Last 25h)")
    print("-" * 70)
    for e in errors:
        print(f"  [{e.get('source')}] {e.get('message')}")
        if e.get("detail"):
            print(f"    Detail: {e.get('detail', '')[:150]}")
        print(f"    Time: {e.get('createdAt', 'N/A')}")

# 8. All Warnings Summary
if warnings:
    print("\n" + "-" * 70)
    print("ALL WARNINGS (Last 25h)")
    print("-" * 70)
    for w in warnings:
        print(f"  [{w.get('source')}] {w.get('message')}")
        if w.get("detail"):
            print(f"    Detail: {w.get('detail', '')[:150]}")

# 9. Exit code determination
print("\n" + "=" * 70)
if errors:
    print(f"EXIT CODE: 1 (ERRORS FOUND — {len(errors)} error(s) require attention)")
    sys.exit(1)
elif warnings:
    print(f"EXIT CODE: 0 (warnings present but no critical errors)")
    sys.exit(0)
else:
    print("EXIT CODE: 0 (ALL CLEAR)")
    sys.exit(0)
