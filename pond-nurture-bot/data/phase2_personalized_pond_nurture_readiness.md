# Phase 2 Personalized Pond Nurture Readiness Memo

Generated: 2026-06-03

This memo summarizes the updated Phase 2 behavior for Follow Up Boss pond nurture and stale-agent reassignment. The feature has been prepared and validated in dry-run mode, but it is **not live**. Customer-facing email and reassignment switches remain disabled until Peter gives explicit approval.

## Requested Behavior and Current Implementation

| Requirement | Prepared behavior | Current live status |
|---|---|---:|
| Email every lead in ponds every two weeks forever | The cadence table stores the last pond nurture timestamp per lead and allows another email after `reengagement_cadence_days: 14`. There is no finite sequence cap, so the cadence repeats indefinitely while the lead remains eligible. | **Disabled** |
| Detect the city from Follow Up Boss notes | The customer nurture path now checks recent FUB notes first for target city names, then falls back to normal lead-field city inference. | **Prepared** |
| Tailor emails to the detected city | The email generator receives the detected city and matching local market context when available. If no city is detected, it uses a Texas-wide message about helping the client find the right city and home. | **Prepared** |
| Make every email feel fresh and personal | The prompt now rotates fresh angles such as rates, neighborhood fit, lifestyle, commute, restaurants, bars, weekend activity, new construction, and home-search strategy. It instructs the generator to write a one-off note rather than a drip/newsletter and to ask one easy reply question. | **Prepared** |
| Use FUB notes safely for personalization | A new sanitizer extracts only short, useful note context, strips emails, phone numbers, links, and HTML, and discourages direct quotation or creepy over-reference to old notes. | **Prepared** |
| Reassign agent-owned leads after 20+ days without agent follow-up/note | The stale-agent flow checks the most recent note activity and, when enabled, reassigns leads with no qualifying note after `stale_agent_no_note_days: 20` to the configured pond. | **Disabled** |
| Send all customer nurture emails from Peter | Configuration remains set to `peter@lifestyledesignrealty.com`. | **Prepared** |

## Validation Performed

The updated implementation was syntax-checked successfully after the personalization changes. A lightweight offline validation confirmed that note-based city detection identifies **San Antonio** from sample FUB-style notes and that private contact details are redacted from note-derived context before the email generator sees it.

A bounded dry-run preview with note lookup enabled completed successfully before the final prompt refinement. It captured **5 customer email previews** and **8 reassignment previews** without sending emails or performing live reassignments. The dry-run confirmed that the system can read note-aware context, generate city-specific nurture copy, and simulate 20-day stale lead reassignment safely.

After refining the prompt to prevent duplicate company signatures, a fast dry-run preview was completed. It captured **2 customer email previews** and **5 reassignment previews** and confirmed that the final footer format is clean: generated email bodies end with Peter only, while the system appends the Lifestyle Design Realty mailing address and unsubscribe language once.

## Active Safety Gate

The current `rules.yaml` values keep Phase 2 inactive for real customer communication and real reassignment:

| Configuration key | Current value | Meaning |
|---|---:|---|
| `customer_reengagement_emails_enabled` | `false` | Customer pond nurture emails are not live. |
| `stale_agent_no_note_reassignment_enabled` | `false` | 20-day stale-agent reassignment is not live. |
| `sms_outreach_enabled` | `false` | SMS remains disabled. |
| `customer_nurture_note_city_lookup_enabled` | `true` | Note-based city inference is ready for dry-run/live use once Phase 2 is approved. |
| `reengagement_cadence_days` | `14` | Eligible pond leads can receive another nurture email after two weeks. |
| `stale_agent_no_note_days` | `20` | Agent-owned leads become reassignment candidates after 20 days without note/follow-up activity. |

> **Approval gate:** Do not enable Phase 2 live until Peter explicitly approves both customer pond nurture emails and stale-agent reassignment. Enabling only one of those switches would partially activate the workflow, so the approval should specify whether Peter wants emails only, reassignment only, or both.

## Practical Notes Before Going Live

The feature is designed to continue indefinitely, but the cadence is controlled by each lead’s last sent timestamp, not by a fixed campaign sequence. That means the copy can keep changing every cycle while still respecting the two-week suppression window. The email body is intentionally generated as a fresh note each time rather than a numbered campaign message.

The city tailoring depends on the quality of the lead’s FUB notes and stored lead details. If the notes mention a target city, the email should lean into that city. If no city is found, the system will avoid guessing and instead use a broader Texas-focused message about helping the lead narrow down the right area.

The current dry-run preview file reflects the final footer and prompt behavior. The earlier full note-aware run validated note lookup, while the final fast run validated prompt cleanup and footer formatting after the last change.
