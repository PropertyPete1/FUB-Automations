# Speed-to-Lead & Pond Nurture Safeguards Checklist

## 🛡️ Critical Safeguards
- [x] **Strict Pond-Only Filtering:** Ensure `pond_nurture_only` is set to `true` in `rules.yaml` so that *only* leads currently inside the Lead Pond (Pond ID: 2) can receive automated emails.
- [x] **Pond Email Validation:** Verify that `qualifies_for_reengagement` strictly checks `assignedPondId == 2`.
- [x] **Protected Stage Reassignment Exclusions:** Ensure the following active stages are strictly excluded from pond reassignments:
  - `Active Client`
  - `Pending`
  - `Closed`
  - `Past Client`
  - `Sphere`
  - `Under Contract`
- [x] **Manual Suppression Tags:** Verify that `Do Not Nurture`, `No AI Email`, `Do Not Email`, and `Manual Review` tags are fully respected and skip both emails and reassignments.
- [x] **Agent Follow-up Warnings:** Verify that the daily agent follow-up warnings (14-20 days) are sent internally to agents for *all* stages (except Trash), but *never* result in automated emails or reassignments for protected active stages.

## 🧪 Verification Tasks
- [x] Run a dry-run scan of the database to verify zero active clients or under-contract leads qualify for emails or reassignments.
- [x] Export updated, safe data to the React dashboard.
- [x] Refresh the React dashboard preview checkpoint.
- [x] Deliver the full audit and report to Peter.

## 📢 Daily Deal Broadcast Mode (Phase C)
- [x] Add `agent_reminder_broadcast_mode_enabled: true` to `rules.yaml` config.
- [x] Implement the daily broadcast email generator in `main.py` that sends the daily featured deal to *all* active agents.
- [x] Ensure agents with stale leads receive their follow-up checklist *below* the daily deal card, while agents with clean pipelines receive just the daily deal card.
- [x] Ensure Peter Allen is CC'd on all non-Peter agent broadcast emails.
- [x] Test the broadcast logic locally in dry-run mode and verify email payloads.
- [x] Deploy the updated codebase and config to the Standard Cloud Computer.

## ⚡ Speed-to-Lead Timer Fix (Phase D)
- [x] Analyze the current new lead warning and reassignment timer logic in `main.py`.
- [x] Check FUB API for Frank Atilano's creation time and why it didn't trigger.
- [x] Fix any issues in `main.py` regarding timer execution (e.g. cron scheduling, business hours logic, or database tracking).
- [x] Re-enable `new_lead_warning_enabled` and `new_lead_reassignment_enabled` in `rules.yaml`.
- [x] Test the speed-to-lead timer logic locally with a simulated new lead.
- [x] Deploy the fix to the Standard Cloud Computer.

## 🔄 Self-Contained API Polling Mode (Phase E)
- [x] Implement `poll_new_leads` in `main.py` that queries FUB API every 5 minutes for leads created in the last 24 hours.
- [x] If a lead is newly assigned to an agent (assignedUserId != Peter Allen's ID) and has no timer, create a new lead timer in the SQLite database.
- [x] Add the polling loop to the background scheduler so it runs automatically every 5 minutes during the 10:00 AM to 6:00 PM business hours.
- [x] Test the polling logic locally with a mock/dry-run API scenario.
- [x] Deploy the updated self-contained polling service to the Standard Cloud Computer.
