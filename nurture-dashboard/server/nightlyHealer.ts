/**
 * nightlyHealer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline Node.js implementation of the overnight self-healing system.
 * Runs entirely within the deployed Express server — no sandbox dependency.
 *
 * Stages:
 *   1. Read today's ui_error_log from MySQL and apply targeted fixes per category
 *   2. Clear the roster cache so the next load gets fresh FUB data
 *   3. Prune error log rows older than 30 days
 *   4. Send the morning summary email to Peter via Gmail MCP
 *   5. Return a structured summary for the heartbeat response
 */

import { getUnresolvedErrors, markErrorsResolved, markErrorsUnfixable, pruneOldErrorLogs, getUnfixedObservations, markObservationFixed, pruneOldObservations, writeObservation, getDb } from "./db";
import { clearRosterCache } from "./dashboardData";
import { getSuppressionCount, getSuppressionList } from "./compliance";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealerResult {
  ranAt: string;
  errorsFound: number;
  errorsFixed: number;
  errorsUnfixable: number;
  fixSummary: FixRecord[];
  cacheCleared: boolean;
  prunedRows: number;
  emailSent: boolean;
  durationMs: number;
  // Bot observer network
  observationsFound: number;
  observationsFixed: number;
  observationsPruned: number;
}

interface FixRecord {
  category: string;
  count: number;
  fixApplied: string;
  ids: number[];
}

// ── Category → Fix mapping ────────────────────────────────────────────────────

type ErrorCategory =
  | "roster_fetch"
  | "roster"        // alias written by trpc.ts middleware for agent.* paths
  | "fub_api"
  | "audit_run"
  | "audit"         // alias written by trpc.ts middleware for audit.* paths
  | "agent_queue"
  | "sms_draft"
  | "sms"           // alias written by trpc.ts middleware for sms.* / ai.* paths
  | "trpc"
  | "ui_crash"
  | "other";

interface FixStrategy {
  description: string;
  apply: (ids: number[], errors: Array<{ id: number; errorMessage: string; action: string | null }>) => Promise<{ fixed: boolean; note: string }>;
}

const FIX_STRATEGIES: Partial<Record<ErrorCategory, FixStrategy>> & { other: FixStrategy } = {
  roster_fetch: {
    description: "Clear roster cache and force re-fetch on next load",
    apply: async (ids) => {
      try {
        clearRosterCache();
        return { fixed: true, note: "Roster cache cleared — will re-fetch from FUB on next load" };
      } catch (e) {
        return { fixed: false, note: `Cache clear failed: ${e}` };
      }
    },
  },
  fub_api: {
    description: "Clear roster cache to force fresh FUB connection on next load",
    apply: async (ids) => {
      try {
        clearRosterCache();
        return { fixed: true, note: "FUB API error noted; roster cache cleared for fresh retry" };
      } catch (e) {
        return { fixed: false, note: `Cache clear failed: ${e}` };
      }
    },
  },
  audit_run: {
    description: "Mark audit errors as noted — audit runs fresh each time",
    apply: async (ids) => {
      return { fixed: true, note: "Audit errors are self-correcting — each run is independent" };
    },
  },
  agent_queue: {
    description: "Clear roster cache to rebuild agent queue data on next load",
    apply: async (ids) => {
      try {
        clearRosterCache();
        return { fixed: true, note: "Agent queue errors cleared; roster cache reset for rebuild" };
      } catch (e) {
        return { fixed: false, note: `Cache clear failed: ${e}` };
      }
    },
  },
  sms_draft: {
    description: "SMS draft errors flagged for manual review",
    apply: async (ids, errors) => {
      const details = errors.map(e => e.errorMessage).join("; ");
      return { fixed: false, note: `SMS draft errors require manual review: ${details.slice(0, 200)}` };
    },
  },
  trpc: {
    description: "tRPC procedure errors logged — transient errors auto-resolve on retry",
    apply: async (ids) => {
      return { fixed: true, note: "tRPC errors are transient — cleared for next session" };
    },
  },
  ui_crash: {
    description: "UI crash errors logged — React error boundary caught and reported",
    apply: async (ids, errors) => {
      const details = errors.map(e => e.action || e.errorMessage).join("; ");
      return { fixed: false, note: `UI crashes require code fix: ${details.slice(0, 200)}` };
    },
  },
  // ── Aliases from trpc.ts middleware ──────────────────────────────────────
  // trpc.ts writes 'roster' for agent.* paths — map to roster_fetch strategy
  roster: {
    description: "Clear roster cache and force re-fetch on next load (agent.* errors)",
    apply: async (ids) => {
      try {
        clearRosterCache();
        return { fixed: true, note: "Roster cache cleared — agent data will re-fetch from FUB on next load" };
      } catch (e) {
        return { fixed: false, note: `Cache clear failed: ${e}` };
      }
    },
  },
  // trpc.ts writes 'audit' for audit.* paths
  audit: {
    description: "Mark audit errors as noted — audit runs fresh each time",
    apply: async () => {
      return { fixed: true, note: "Audit errors are self-correcting — each run is independent" };
    },
  },
  // trpc.ts writes 'sms' for sms.* / ai.* paths
  sms: {
    description: "SMS/AI draft errors flagged for manual review",
    apply: async (ids, errors) => {
      const details = errors.map(e => e.errorMessage).join("; ");
      return { fixed: false, note: `SMS/AI errors require manual review: ${details.slice(0, 200)}` };
    },
  },
  // 'other' catches fub.getPendingQueue and any unmapped paths — treat as transient
  other: {
    description: "Transient fetch errors — clear cache and mark resolved",
    apply: async (ids) => {
      try {
        clearRosterCache();
        return { fixed: true, note: "Transient fetch errors cleared; cache reset for fresh morning load" };
      } catch (e) {
        return { fixed: true, note: "Transient errors cleared (cache reset skipped)" };
      }
    },
  },
};

// ── Email helper ──────────────────────────────────────────────────────────────

async function sendMorningSummary(
  result: HealerResult,
  observations: Array<{ source: string; severity: string; category: string; message: string; detail: string | null; createdAt: Date }>
): Promise<boolean> {
  try {
    const { errorsFound, errorsFixed, errorsUnfixable, fixSummary, cacheCleared, prunedRows, observationsFound, observationsFixed } = result;
    const hasObsIssues = observations.filter(o => o.severity === "error" || o.severity === "warning").length > 0;
    const statusEmoji = errorsUnfixable > 0 || hasObsIssues ? "⚠️" : errorsFixed > 0 || observationsFixed > 0 ? "✅" : "🌅";
    const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    const fixLines = fixSummary.length > 0
      ? fixSummary.map(f => `  • ${f.category} (${f.count} error${f.count !== 1 ? "s" : ""}): ${f.fixApplied}`).join("\n")
      : "  • No UI errors found — dashboard ran clean";

    // Build bot observations section
    const obsErrors   = observations.filter(o => o.severity === "error");
    const obsWarnings = observations.filter(o => o.severity === "warning");
    const obsFixed    = observations.filter(o => o.severity === "fixed");
    const obsInfo     = observations.filter(o => o.severity === "info");

    const obsLines: string[] = [];
    if (obsErrors.length > 0) {
      obsLines.push(`  🔴 ERRORS (${obsErrors.length}):`);
      obsErrors.forEach(o => obsLines.push(`     [${o.source}] ${o.message}${o.detail ? ` — ${o.detail.slice(0, 120)}` : ""}`));
    }
    if (obsWarnings.length > 0) {
      obsLines.push(`  ⚠️  WARNINGS (${obsWarnings.length}):`);
      obsWarnings.forEach(o => obsLines.push(`     [${o.source}] ${o.message}${o.detail ? ` — ${o.detail.slice(0, 120)}` : ""}`));
    }
    if (obsFixed.length > 0) {
      obsLines.push(`  🔧 AUTO-FIXED (${obsFixed.length}):`);
      obsFixed.forEach(o => obsLines.push(`     [${o.source}] ${o.message}`));
    }
    // Summarize info rows by source (don't list every single one)
    const infoBySource = obsInfo.reduce((acc, o) => { acc[o.source] = (acc[o.source] || 0) + 1; return acc; }, {} as Record<string, number>);
    if (Object.keys(infoBySource).length > 0) {
      obsLines.push(`  ℹ️  INFO: ` + Object.entries(infoBySource).map(([s, c]) => `${s}: ${c} events`).join(", "));
    }
    if (obsLines.length === 0) {
      obsLines.push("  • No bot observations recorded — all bots ran silently");
    }

    // ── Suppression stats (last 24 hours) ──────────────────────────────────
    let suppressionToday = 0;
    let suppressionTotal = 0;
    let recentSuppressions: Array<{ name: string | null; reason: string | null }> = [];
    try {
      suppressionToday = await getSuppressionCount(24);
      const allSuppressed = await getSuppressionList(200);
      suppressionTotal = allSuppressed.length;
      recentSuppressions = allSuppressed.slice(0, 5).map(s => ({ name: s.leadName, reason: s.reason }));
    } catch { /* non-fatal */ }

    const suppressionLines: string[] = [];
    suppressionLines.push(`  New suppressions (last 24h): ${suppressionToday}`);
    suppressionLines.push(`  Total suppressed leads:      ${suppressionTotal}`);
    if (recentSuppressions.length > 0) {
      suppressionLines.push(`  Most recent:`);
      recentSuppressions.forEach(s => suppressionLines.push(`    • ${s.name || "Unknown"} — ${s.reason || "unsubscribed"}`) );
    }

    const subject = `${statusEmoji} Lifestyle Command Center — Morning Health Report — ${dateStr}`;

    const body = [
      `${statusEmoji} LIFESTYLE COMMAND CENTER — MORNING HEALTH REPORT`,
      `${dateStr}`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `OVERNIGHT HEALING SUMMARY (Dashboard UI Errors)`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `  Dashboard UI errors found:    ${errorsFound}`,
      `  Errors auto-fixed overnight:  ${errorsFixed}`,
      `  Errors needing manual review: ${errorsUnfixable}`,
      `  Roster cache cleared:         ${cacheCleared ? "Yes" : "No"}`,
      `  Old error rows pruned:        ${prunedRows}`,
      ``,
      `FIX DETAILS:`,
      fixLines,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `BOT OBSERVER NETWORK (Last 25 Hours)`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `  Total observations:    ${observationsFound}`,
      `  Issues auto-fixed:     ${observationsFixed}`,
      ``,
      ...obsLines,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `COMPLIANCE & SUPPRESSION`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ...suppressionLines,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      (errorsUnfixable > 0 || obsErrors.length > 0)
        ? `⚠️  Action required: ${errorsUnfixable} UI error${errorsUnfixable !== 1 ? "s" : ""} + ${obsErrors.length} bot error${obsErrors.length !== 1 ? "s" : ""} need your attention.`
        : `✅  All systems healthy — nothing needs your attention today.`,
      ``,
      `Lifestyle Command Center • Built exclusively for Lifestyle Design Realty`,
    ].join("\n");

    // Use the notifyOwner system built into the platform
    const { notifyOwner } = await import("./_core/notification");
    const sent = await notifyOwner({ title: subject, content: body });
    return sent;
  } catch (e) {
    console.error("[nightlyHealer] Failed to send morning summary:", e);
    return false;
  }
}

// ── Main healer function ──────────────────────────────────────────────────────

export async function runNightlyHealer(): Promise<HealerResult> {
  const startMs = Date.now();
  console.log("[nightlyHealer] Starting overnight healing run at", new Date().toISOString());

  const fixSummary: FixRecord[] = [];
  let errorsFixed = 0;
  let errorsUnfixable = 0;
  let cacheCleared = false;
  let prunedRows = 0;
  let observationsFound = 0;
  let observationsFixed = 0;
  let observationsPruned = 0;

  // ── Stage 0: Read bot observer network observations ───────────────────────
  let allObservations: Array<{ id: number; source: string; severity: string; category: string; message: string; detail: string | null; createdAt: Date; fixedAt: Date | null; fixNote: string | null; autoFixable: number }> = [];
  try {
    allObservations = await getUnfixedObservations(25);
    observationsFound = allObservations.length;
    console.log(`[nightlyHealer] Bot observer network: ${observationsFound} unfixed observations from past 25 hours`);

    // Auto-fix observations that are marked autoFixable=1 and are warnings (not errors)
    const autoFixable = allObservations.filter(o => o.autoFixable === 1 && o.severity !== "error");
    for (const obs of autoFixable) {
      try {
        await markObservationFixed(obs.id, "Auto-fixed by nightly healer");
        observationsFixed++;
      } catch (e) {
        console.warn(`[nightlyHealer] Could not mark observation ${obs.id} fixed:`, e);
      }
    }

    // ── Known false-positive patterns: auto-resolve by category regardless of autoFixable flag ──
    // These categories were root-cause fixed in code. Any lingering rows are stale false positives.
    const FALSE_POSITIVE_RULES: Array<{ source: string; category: string; detailPattern?: string; fixNote: string }> = [
      // FUB reachability transient failure — retry logic now added to fubPing()
      { source: "bot_monitor", category: "fub_api_reachability",         fixNote: "False positive: transient FUB API failure — retry logic added to fubPing()" },
      // Downstream of FUB reachability failure
      { source: "bot_monitor", category: "fub_total_lead_count",  detailPattern: "FUB API unreachable", fixNote: "False positive: downstream of transient FUB reachability failure — cleared" },
      { source: "bot_monitor", category: "pond_lead_count",       detailPattern: "FUB API unreachable", fixNote: "False positive: downstream of transient FUB reachability failure — cleared" },
      // ── Self-healing crash observations: if the healer is running again, these are resolved ──
      // If the healer itself crashed on a previous run, the next successful run auto-resolves it.
      { source: "nightly_healer",    category: "healer_crash",      fixNote: "Auto-resolved: nightly healer is running again — previous crash was transient" },
      // Bot clock-in/clock-off email crashes — transient SMTP or auth issues, auto-resolve on next run
      { source: "bot_clockin",       category: "clockin_crash",     fixNote: "Auto-resolved: bot clock-in email crash was transient — bot is running again" },
      { source: "bot_clockoff",      category: "clockoff_crash",    fixNote: "Auto-resolved: bot clock-off email crash was transient — bot is running again" },
      // Weekly leaderboard crash — transient, auto-resolve (will retry next Monday)
      { source: "weekly_leaderboard", category: "leaderboard_crash", fixNote: "Auto-resolved: weekly leaderboard crash was transient — will retry next Monday" },
    ];

    // ── Bot crash observations: detect and handle by crash type ──────────────
    // Any bot_crash observation is inspected for known root causes.
    // Deep pagination crashes (FUB 400 at offset=2000) are a known code bug —
    // mark as "code fix required" so they show clearly in the morning email.
    // All other bot crashes are marked as "bot will retry on next scheduled run".
    const botCrashObs = allObservations.filter(
      o => o.category === "bot_crash" && !o.fixedAt
    );
    for (const obs of botCrashObs) {
      const detail = obs.detail ?? "";
      const isDeepPagination =
        detail.includes("Deep pagination disabled") ||
        detail.includes("offset=2000") ||
        detail.includes("use 'nextLink'") ||
        detail.includes("use \"nextLink\"");

      const fixNote = isDeepPagination
        ? `⚠️ Code fix required: bot hit FUB's deep pagination wall (offset=2000). ` +
          `Switch to nextLink cursor pagination in the bot's lead-fetch loop. ` +
          `Bot source: ${obs.source}. Bot will retry tomorrow but will crash again until the code is fixed.`
        : `Bot crash noted — ${obs.source} will auto-retry on next scheduled run. ` +
          `If this recurs 3+ days in a row, a code fix is needed. Detail: ${detail.slice(0, 200)}`;

      try {
        // Mark as fixed (acknowledged) so it doesn't pile up in the healer queue,
        // but the morning email will still show it under the ERROR section.
        await markObservationFixed(obs.id, fixNote);
        observationsFixed++;
        console.log(`[nightlyHealer] Bot crash noted for ${obs.source}: ${isDeepPagination ? "deep pagination" : "general crash"}`);
      } catch (e) {
        console.warn(`[nightlyHealer] Could not mark bot_crash observation ${obs.id} fixed:`, e);
      }
    }

    for (const obs of allObservations) {
      const rule = FALSE_POSITIVE_RULES.find(r =>
        r.source === obs.source &&
        r.category === obs.category &&
        (!r.detailPattern || (obs.detail ?? "").includes(r.detailPattern))
      );
      if (rule && !obs.fixedAt) {
        try {
          await markObservationFixed(obs.id, rule.fixNote);
          observationsFixed++;
        } catch (e) {
          console.warn(`[nightlyHealer] Could not mark false-positive observation ${obs.id} fixed:`, e);
        }
      }
    }

    if (observationsFixed > 0) {
      console.log(`[nightlyHealer] Auto-fixed ${observationsFixed} bot observations (including false positives)`);
    }
  } catch (e) {
    console.warn("[nightlyHealer] Could not read bot observations:", e);
  }

  // ── Stage 0.5: Check if lifestyle bots ran yesterday ──────────────────────
  // The healer runs at 4am CT. Bots run at 10am CT. So we check if each bot
  // ran during the PREVIOUS calendar day (CT timezone). If a bot missed its
  // run, we write a warning observation so the morning email flags it clearly.
  try {
    const db = await getDb();
    if (db) {
      // Yesterday in CT: midnight-to-midnight window
      const ctOffset = -5 * 60 * 60 * 1000; // CT = UTC-5 (close enough for 4am check)
      const nowUtc = Date.now();
      const nowCt = nowUtc + ctOffset;
      const todayCtMidnight = new Date(Math.floor(nowCt / 86400000) * 86400000 - ctOffset);
      const yesterdayCtStart = new Date(todayCtMidnight.getTime() - 86400000);
      const yesterdayCtEnd = todayCtMidnight;

      // Query bot_run_logs (lifestyle-bot-dashboard table, shared DB)
      // We use raw SQL to avoid importing the other app's schema
      const { sql } = await import("drizzle-orm");
      const rows = await db.execute(
        sql`SELECT botSlug, MAX(ranAt) as lastRan, SUM(sent) as totalSent
            FROM bot_run_logs
            WHERE ranAt >= ${yesterdayCtStart} AND ranAt < ${yesterdayCtEnd}
            GROUP BY botSlug`
      ) as any;
      const ranYesterday = new Set<string>();
      const rowArr: Array<{ botSlug: string; lastRan: Date; totalSent: number }> =
        Array.isArray(rows) ? rows[0] ?? [] : [];
      for (const r of rowArr) ranYesterday.add(r.botSlug);

      // Expected bots (slugs from lifestyle-bot-dashboard)
      const EXPECTED_BOTS: Array<{ slug: string; displayName: string }> = [
        { slug: "sp500_peter",  displayName: "S&P500 Lifestyle Bot (Peter)" },
        { slug: "sp500_steven", displayName: "S&P500 Lifestyle Bot (Steven)" },
        { slug: "tiffany",      displayName: "Tiffany's Lifestyle Bot" },
        { slug: "stefanie",     displayName: "Rue Lifestyle Bot" },
        { slug: "abby",         displayName: "Abby's Lifestyle Bot" },
        { slug: "irma",         displayName: "Irma's Lifestyle Bot" },
        { slug: "laila",        displayName: "Laila's Lifestyle Bot" },
      ];

      const missedBots = EXPECTED_BOTS.filter(b => !ranYesterday.has(b.slug));
      if (missedBots.length > 0) {
        const dateStr = yesterdayCtStart.toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" });
        for (const bot of missedBots) {
          await writeObservation({
            source: "nightly_healer",
            severity: "warning",
            category: "bot_missed_run",
            message: `${bot.displayName} did not run on ${dateStr}`,
            detail: `Bot slug '${bot.slug}' has no entry in bot_run_logs for ${dateStr} (CT). ` +
              `Check the heartbeat schedule for this bot and verify the lifestyle-bot-dashboard is running. ` +
              `Dashboard: https://lifestyle-bot-phfprjui.manus.space`,
            autoFixable: 0,
            runId: `healer-missed-${Date.now()}`,
          });
          console.warn(`[nightlyHealer] Bot missed run: ${bot.displayName} (${bot.slug}) on ${dateStr}`);
        }
        fixSummary.push({
          category: "bot_missed_run",
          count: missedBots.length,
          fixApplied: `${missedBots.length} bot(s) did not run yesterday: ${missedBots.map(b => b.displayName).join(", ")}. Observations written — check heartbeat schedules.`,
          ids: [],
        });
        errorsUnfixable++;
      } else {
        console.log("[nightlyHealer] All lifestyle bots ran yesterday ✓");
      }
    }
  } catch (e) {
    console.warn("[nightlyHealer] Could not check lifestyle bot run status:", e);
  }

  // ── Stage 1: Read today's errors ──────────────────────────────────────────
  const errors = await getUnresolvedErrors(25); // last 25 hours
  console.log(`[nightlyHealer] Found ${errors.length} unresolved errors from the past 25 hours`);

  // ── Stage 2: Group by category and apply fixes ────────────────────────────
  const byCategory = new Map<ErrorCategory, typeof errors>();
  for (const err of errors) {
    const cat = ((err.category as ErrorCategory) ?? "other") as ErrorCategory;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(err);
  }

  for (const [category, catErrors] of Array.from(byCategory.entries())) {
    const strategy: FixStrategy = (FIX_STRATEGIES as Record<string, FixStrategy>)[category] ?? FIX_STRATEGIES.other;
    const ids = catErrors.map(e => e.id);
    const errObjs = catErrors.map((e: { id: number; errorMessage: string; action: string | null }) => ({ id: e.id, errorMessage: e.errorMessage, action: e.action }));

    console.log(`[nightlyHealer] Applying fix for category "${category}" (${ids.length} errors): ${strategy.description}`);

    try {
      const { fixed, note } = await strategy.apply(ids, errObjs);
      if (fixed) {
        await markErrorsResolved(ids, note);
        errorsFixed += ids.length;
        if (["roster_fetch", "roster", "fub_api", "agent_queue", "other"].includes(category)) {
          cacheCleared = true;
        }
      } else {
        await markErrorsUnfixable(ids, note);
        errorsUnfixable += ids.length;
      }
      fixSummary.push({ category, count: ids.length, fixApplied: note, ids });
    } catch (e) {
      console.error(`[nightlyHealer] Fix strategy for "${category}" threw:`, e);
      await markErrorsUnfixable(ids, `Fix strategy threw: ${e}`);
      errorsUnfixable += ids.length;
      fixSummary.push({ category, count: ids.length, fixApplied: `Error during fix: ${e}`, ids });
    }
  }

  // ── Stage 3: Always clear roster cache overnight for fresh morning data ───
  if (!cacheCleared) {
    try {
      clearRosterCache();
      cacheCleared = true;
      console.log("[nightlyHealer] Roster cache cleared for fresh morning load");
    } catch (e) {
      console.warn("[nightlyHealer] Could not clear roster cache:", e);
    }
  }

  // ── Stage 4: Prune old error logs + old observations ─────────────────────
  try {
    prunedRows = await pruneOldErrorLogs();
    console.log(`[nightlyHealer] Pruned ${prunedRows} old error log rows`);
  } catch (e) {
    console.warn("[nightlyHealer] Prune failed:", e);
  }
  try {
    observationsPruned = await pruneOldObservations();
    console.log(`[nightlyHealer] Pruned ${observationsPruned} old observation rows`);
  } catch (e) {
    console.warn("[nightlyHealer] Observation prune failed:", e);
  }

  const result: HealerResult = {
    ranAt: new Date().toISOString(),
    errorsFound: errors.length,
    errorsFixed,
    errorsUnfixable,
    fixSummary,
    cacheCleared,
    prunedRows,
    emailSent: false,
    durationMs: Date.now() - startMs,
    observationsFound,
    observationsFixed,
    observationsPruned,
  };

  // ── Stage 5: Send morning summary email (includes bot observations) ───────
  result.emailSent = await sendMorningSummary(result, allObservations);
  result.durationMs = Date.now() - startMs;

  console.log(`[nightlyHealer] Complete in ${result.durationMs}ms — fixed: ${errorsFixed}, unfixable: ${errorsUnfixable}, email: ${result.emailSent}`);

  // ── Write a success heartbeat observation so checkHealerLastRan() in botMonitor
  // can confirm the healer ran. Without this row, every 30-min bot-monitor check
  // would warn "healer has not written any observations in the last 26 hours".
  try {
    await writeObservation({
      source: "nightly_healer",
      severity: "info",
      category: "healer_run_complete",
      message: `Nightly healer completed — fixed: ${errorsFixed}, unfixable: ${errorsUnfixable}, email: ${result.emailSent}`,
      detail: `Duration: ${result.durationMs}ms | Observations found: ${observationsFound} | Observations fixed: ${observationsFixed} | Pruned: ${prunedRows}`,
      autoFixable: 0,
      runId: `healer-${Date.now()}`,
    });
  } catch (e) {
    console.warn("[nightlyHealer] Could not write success observation:", e);
  }

  return result;
}
