# Lifestyle Bot Dashboard — TODO

## Phase 1: Foundation
- [x] Initialize webdev project (web-db-user scaffold)
- [x] Add DB schema: bot_run_logs, bot_observations, sms_sent_today tables
- [x] Apply DB migration SQL

## Phase 2: Per-Agent Bot Files
- [x] Create server/botHelpers.ts — shared FUB client, SMTP, LLM, dedup helpers
- [x] Create server/spBot.ts — S&P500 Lifestyle Bot (Steven ID:1 + Peter ID:2)
- [x] Create server/tiffanyBot.ts — Tiffany Proske (FUB ID: 20)
- [x] Create server/stefanieBot.ts — Stefanie Graham (FUB ID: 31)
- [x] Create server/abbyBot.ts — Abby Martinez (FUB ID: 28)
- [x] Create server/irmaBot.ts — Irma Vidic Crisp (FUB ID: 33)
- [x] Create server/lailaBot.ts — Laila Maria (FUB ID: 35)
- [x] Luke Durbin EXCLUDED per owner request — not building lukeBot.ts

## Phase 3: Bot Infrastructure
- [x] Create server/botMonitor.ts — nightly health checks for all 6 bots
- [x] Create server/scheduledHandlers.ts — all clock-in, run, clock-off handlers
- [x] Register all bot routes in server/_core/index.ts
- [x] Add bot-specific tRPC procedures in server/routers.ts (health, recentRuns, recentObservations, weeklyStats)

## Phase 4: Dashboard UI
- [x] Create client/src/pages/AgentBots.tsx — full Agent Bot Activity page
- [x] Update DashboardLayout.tsx — proper nav with Dashboard + Agent Bots items
- [x] Update App.tsx — routes for / and /agent-bots
- [x] Update Home.tsx — dashboard overview with bot status cards + KPI tiles
- [x] Show: last run time, leads contacted, errors, status per bot
- [x] 7-day run history table with per-bot filter
- [x] Daily schedule reference panel

## Phase 5: Quality & Delivery
- [x] Write vitest tests for bot helpers — 31 tests passing (3 test files)
- [x] Verify all closing lines present in email templates
- [x] Save checkpoint
- [x] Document cron registration commands for post-publish (see delivery message)
- [x] Register Manus heartbeat cron jobs after publish — 19 cron jobs registered

## Phase 6: Pond Nurture Integration (Combine with Old Dashboard)
- [x] Build client/src/pages/PondNurture.tsx — live FUB agent stats, bot activity, system status
- [x] Add Pond Nurture nav item to sidebar (Droplets icon)
- [x] Wire pondNurture tRPC router (agentStats, pondMetrics)
- [x] Add /pond-nurture route in App.tsx
- [x] "Full Dashboard" button links to old fub-nurture-phfprjui.manus.space for full analytics

## Phase 7: Quick Fixes
- [x] Add "Full Analytics" link in new dashboard sidebar — opens fub-nurture-phfprjui.manus.space in new tab
- [x] Rename Stefanie's bot to "Rue Lifestyle Bot" in stefanieBot.ts, botMonitor.ts, AgentBots.tsx, PondNurture.tsx, cron-registration.md
- [x] Update 3 live cron job descriptions to "Rue Lifestyle Bot" via manus-heartbeat update

## Phase 8: Bot Intelligence & Reliability Upgrades
- [x] Upgrade botHelpers.ts: send actual email to leads (not just FUB note)
- [x] Upgrade botHelpers.ts: smarter AI prompts using lead notes, stage, days stale, behavioral signals
- [x] Upgrade botHelpers.ts: add Reply-To header on clock-in/off emails pointing to peter@lifestyledesignrealty.com
- [x] Upgrade botHelpers.ts: ask agent in clock-in/off if they want anything automated, replies forward to Peter
- [x] Upgrade scheduledHandlers.ts: wrap all handlers in try/catch that writes bot_crash observation to night healer
- [x] Add contacted_leads DB table for per-lead audit log (name, stage, days stale, message, sentAt, botSlug)
- [x] Update all 6 bot run functions to write to contacted_leads table
- [x] Add tRPC bots.contactedLeads procedure (filter by botSlug + date)
- [x] Build per-agent lead list modal in AgentBots.tsx (click bot card → see today's leads with name, stage, days stale, full message preview)

## Phase 9: KPI Accuracy & Live-Update Fixes
- [x] Add bots.todayStats tRPC procedure — queries bot_run_logs filtered to today only, deduped per bot slug
- [x] Fix Home.tsx — Sent Today and Errors Today now use todayStats (today-only, not stale prior-run data)
- [x] Fix Home.tsx — schedule description now says "each agent + Peter & Steven"
- [x] Fix AgentBots.tsx — SummaryKPIs now uses todayStats for accurate Sent Today and Errors Today
- [x] Fix AgentBots.tsx — schedule description now says "each agent + Peter & Steven"
- [x] Fix PondNurture.tsx — add stefanie key alias in AGENT_COLORS and AGENT_ROLES (maps to rue's pink/San Antonio)
- [x] Fix PondNurture.tsx — System Status badges now wired to live bots.health data (green/yellow/red/neutral per real bot status)
- [x] Fix PondNurture.tsx — add refetchInterval: 2 min to agentStats, pondMetrics, and bots.health queries
- [x] Fix routers.ts — pondNurture.agentStats uses assignedUserId= (correct FUB field, was assignedTo=)
- [x] Fix routers.ts — pondNurture.pondMetrics uses isPond=true (correct FUB filter, was tags=pond)
- [x] Fix routers.ts — pondNurture.pondMetrics adds recentlyNurtured count using isPond=true&lastActivityAfter=
- [x] TypeScript check: no errors
- [x] All 31 vitest tests passing

## Phase 10: One-Time Bot Launch Introduction Emails (6pm Today)
- [x] Add isLaunchDay() helper in botHelpers.ts — checks if today is 2026-06-15 in CT timezone
- [x] Add sendBotIntroEmail(botSlug) in botHelpers.ts — unique first-person HTML intro for all 6 bots
- [x] S&P500 intro: dual-agent story, blue gradient, hype about exclusive brokerage advantage
- [x] Tiffany intro: Austin market focus, teal gradient, dedicated AI bot story
- [x] Rue (Stefanie) intro: named identity story, pink gradient, San Antonio focus
- [x] Abby intro: Austin market focus, purple gradient, pipeline warmth story
- [x] Irma intro: DFW market focus, amber gradient, competitive advantage hype
- [x] Laila intro: San Antonio focus, green gradient, relationship business story
- [x] Wire all 6 clock-off handlers in scheduledHandlers.ts — isLaunchDay() guard sends intro instead of normal clockoff
- [x] Starting tomorrow (2026-06-16+) all handlers automatically revert to normal clock-off emails
- [x] TypeScript clean — no errors
- [x] 31 vitest tests passing

## Phase 11: Power Queue Agent Filter Fix
- [x] Root cause: stefanieBot.ts uses AGENT_FIRST="Rue" (bot name) — AGENT_DASHBOARD_SLUG had no "rue" key so Power Queue URL had no ?agent= filter, showing all agents' leads
- [x] Add POWER_QUEUE_AGENT_NAME map in botHelpers.ts — maps agentFirstName (lowercase) to FUB display name for ?agent= filter
- [x] Add rue: "Stefanie" entry to POWER_QUEUE_AGENT_NAME (Rue bot → Stefanie Graham's leads)
- [x] Add rue: "stefanie" entry to AGENT_DASHBOARD_SLUG (Rue bot → stefanie dashboard slug)
- [x] Update sendClockinEmail() to build powerQueueUrl with ?agent=<name> filter for all agents
- [x] TypeScript clean — no errors
- [x] 31 vitest tests passing

## Phase 12: Agent-Scoped Dashboard Views
- [x] Create /agent/:slug route — no login required, read-only, shows only that agent's bot data
- [x] Build AgentView.tsx page — single-bot KPIs, today's run stats, recent leads contacted, 7-day history
- [x] Add bots.agentView tRPC procedure — returns filtered data for a single botSlug (public, no auth)
- [x] Update sendClockinEmail() in botHelpers.ts — dashboard link uses /agent/<slug> for non-leader agents
- [x] Leaders (Peter, Steven, Stefanie/Rue) keep full dashboard link (/)
- [x] Non-leaders (Tiffany, Abby, Irma, Laila) get /agent/<slug> link in clock-in emails
- [x] Add /agent/:slug route to App.tsx outside DashboardLayout (no login required)
- [x] TypeScript clean, 31 tests passing

## Phase 14: Power Queue Button + Healer API Bridge
- [x] Add Power Queue button to AgentView.tsx with pre-filtered ?agent= URL (color-matched banner, opens in new tab)
- [x] Add GET /api/healer/observations route to server/_core/index.ts (x-healer-token auth, 26hr lookback, slug mapping)
- [x] Add HEALER_SECRET env var to WebDev project via webdev_request_secrets
- [x] Update DASHBOARD_URL in Cloud PC .env to https://lifestyledash-wpnl8v84.manus.space
- [x] Update AGENTS.md on Cloud PC to mark healer bridge as completed
- [x] Add healer.api.test.ts with 6 tests covering auth guard, slug mapping, and env var presence
- [x] TypeScript clean, 37 tests passing (6 new)
- [x] Publish the site — /api/healer/observations now live on production URL
- [x] End-to-end verified from Cloud PC: correct token returns HTTP 200 + JSON, wrong token returns HTTP 401

## Phase 15: Lead Email Bug Fixes
- [x] Remove duplicate greeting from lead follow-up emails (AI body already opens with "Hey [Name]," — template was adding a second one)
- [x] Remove leaked "Is there anything else I can automate to make your life easier?" line from client-facing emails (was an internal debug instruction that leaked into the AI prompt output)
- [x] Add regex strip as safety net in case LLM hallucinates the automation line from prior context
- [x] TypeScript clean, 37 tests passing

## Phase 16: S&P500 Split + Clock-Off Timing + Gmail Lead Reply Detection
- [x] Split S&P500 bot into sp-peter-run (10:05am CT) and sp-steven-run (10:07am CT) to avoid 2-min heartbeat timeout
- [x] Add runSpBotPeter() and runSpBotSteven() functions to spBot.ts
- [x] Register sp-peter-run (GpNDcdcarC2tniUJbzbmQ8) and sp-steven-run (jkW63UgBob8rkDfmF9XoFR) heartbeats
- [x] Delete old combined sp500-run heartbeat (Rp5qYtMSbWC7tJJWw48HUz) that was timing out
- [x] Fix all 6 clock-off crons from 0 0 23 * * * (5pm CDT) to 0 0 0 * * * (6pm CDT = midnight UTC)
- [x] Create leadReplyChecker.ts — scans Gmail for lead replies in past 24h, writes observations to DB
- [x] Add handleLeadReplyCheck handler to scheduledHandlers.ts
- [x] Mount /api/scheduled/lead-reply-check route in index.ts
- [x] Register lead-reply-check heartbeat at 3:50am CT (UnUjCH6LkcS2eKyn2sUz5Z) — 10min before 4am healer
- [x] TypeScript clean, 37 tests passing

## Phase 17: Light-Tech Redesign (Match FUB Nurture Dashboard)
- [x] Add Inter font via Google Fonts CDN in client/index.html
- [x] Rewrite client/src/index.css — light-tech CSS variables: #F8F9FC background, #FFFFFF cards, #E4E7EF borders, amber #F59E0B primary, 0.5rem radius, Inter font-family
- [x] Update card.tsx — remove shadow-sm, change rounded-xl to rounded-lg (0.5rem)
- [x] Update dialog.tsx — remove shadow-lg from DialogContent
- [x] Update dropdown-menu.tsx — remove shadow-md/shadow-lg from DropdownMenuContent and DropdownMenuSubContent
- [x] Update button.tsx — remove shadow-xs from outline variant
- [x] Rewrite AgentView.tsx — replace dark gradient header with light-tech per-agent accent border, amber Power Queue banner, all light-tech tokens
- [x] Update AgentBots.tsx — replace hover:shadow-md with hover:bg-slate-50, update status badge colors to -50 bg variants
- [x] Update Home.tsx — update status badge colors to -50 bg variants
- [x] Update PondNurture.tsx — remove hover:shadow-md from AgentCard, update status badge colors, align accent colors to amber/red/foreground
- [x] Update DashboardLayout.tsx — remove shadow-lg from Sign in button
- [x] TypeScript check: 0 errors
- [x] All 37 vitest tests passing
- [x] Checkpoint saved + published

## Phase 18: Full Accuracy Audit & Layout Redesign
- [x] Rebuild DashboardLayout.tsx — replace sidebar with sticky top-nav (logo, nav pills, user avatar) matching FUB Nurture Dashboard
- [x] Rewrite index.css — exact CSS variable tokens from FUB Nurture (oklch, --radius: .5rem, --primary amber)
- [x] Update card.tsx — rounded-xl + shadow-sm + border-[#E4E7EF] + bg-white to match FUB Nurture
- [x] Add Inter 400–800 weights to index.html
- [x] Add "← Bot Dashboard" back-link pill to AgentView.tsx header
- [x] Update clock-in email — two-lane layout: Bot's Job (green) vs Agent's Job (amber) with explicit Power Queue CTA
- [x] Fix botMonitor.ts ALL_BOTS — replace old sp500 slug with sp500_peter and sp500_steven
- [x] Fix AgentBots.tsx BOT_AVATARS/BOT_COLORS — add sp500_peter and sp500_steven entries
- [x] Fix AgentView.tsx BOT_COLORS/BOT_AVATARS/AGENT_NAMES/POWER_QUEUE_NAMES — add sp500_peter and sp500_steven
- [x] Fix PondNurture.tsx AGENT_BOT_SLUG and SYSTEM_SERVICES — use sp500_peter/sp500_steven slugs, rename "S&P500 Bot" to "Peter Bot"/"Steven Bot"
- [x] Fix server/_core/index.ts healer slug mapping — add sp500_peter → peter_bot, sp500_steven → steven_bot
- [x] Fix routers.ts pipeline calculation — Math.max(0, total - hot - active) to prevent negative numbers
- [x] Fix AgentBots.tsx SummaryKPIs System Health — treat sp500_peter/sp500_steven not_run as ok (new slugs, no history yet)
- [x] Fix botMonitor.ts runBotMonitor — exclude sp500_peter/sp500_steven not_run from warnings list
- [x] Active Bots KPI on Home.tsx now dynamic (bots.length) instead of hardcoded 6
- [x] TypeScript check: 0 errors

## Phase 19: Power Queue Integration (Two-System Unification)
- [x] Add fetchPowerQueueCount(agentName) helper in botHelpers.ts — calls FUB Nurture API to get real 1-20 day stale count
- [x] Fix all 6 bot clock-in handlers to use fetchPowerQueueCount() instead of isEligible() count
- [x] Rewrite clock-in email "Agent's Job" copy to clearly distinguish bot's 20+ day leads vs agent's 1-20 day Power Queue
- [x] Add tRPC procedure powerQueue.getLiveCount in routers.ts — proxies FUB Nurture API for dashboard use
- [x] Add Power Queue live count widget to AgentView.tsx — shows both bot email count and Power Queue count side by side
- [x] TypeScript check (0 errors)
- [x] Save checkpoint

## Phase 20: Deep Pagination Fix
- [x] Replace offset-based pagination in fetchLeadsForAgent (botHelpers.ts) with FUB cursor-based _metadata.next pagination — fixes 400 crash at offset=2000 for Peter (4,800+ leads)
- [x] Sort by -lastActivityAt so freshest leads come first (matches Python reference in main.py)
- [x] TypeScript check (0 errors)
- [x] Save checkpoint
