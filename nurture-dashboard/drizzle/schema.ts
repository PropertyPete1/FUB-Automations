import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here

/**
 * Stores per-agent memories that persist across Copilot sessions.
 * The Copilot reads these and injects them into its system prompt so it
 * "remembers" agent preferences, lead patterns, and brokerage insights.
 */
export const copilotMemories = mysqlTable("copilot_memories", {
  id: int("id").autoincrement().primaryKey(),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  memoryText: text("memory_text").notNull(),
  category: varchar("category", { length: 50 }).default("general").notNull(), // e.g. 'agent_style', 'lead_insight', 'market_knowledge'
  importanceScore: int("importance_score").default(1).notNull(), // 1-5, higher = more important
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CopilotMemory = typeof copilotMemories.$inferSelect;
export type InsertCopilotMemory = typeof copilotMemories.$inferInsert;

/**
 * Tracks which AI-drafted messages agents actually sent vs ignored.
 * Positive signals (sent) teach the Copilot what works; negative signals
 * (ignored/regenerated) teach it what to avoid.
 */
export const copilotFeedback = mysqlTable("copilot_feedback", {
  id: int("id").autoincrement().primaryKey(),
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  draftText: text("draft_text").notNull(),
  leadCity: varchar("lead_city", { length: 100 }),
  leadStage: varchar("lead_stage", { length: 100 }),
  draftType: varchar("draft_type", { length: 20 }).default("outbound").notNull(), // 'outbound' | 'reply'
  action: mysqlEnum("action", ["sent", "ignored", "regenerated", "edited"]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CopilotFeedback = typeof copilotFeedback.$inferSelect;
export type InsertCopilotFeedback = typeof copilotFeedback.$inferInsert;

/**
 * Daytime error memory for the overnight self-healing system.
 * Every tRPC failure, FUB API error, or UI crash during the day is written here.
 * The nightly healer reads unresolved rows, applies targeted fixes, and marks them resolved.
 * Rows older than 30 days are pruned automatically by the weekly cleanup cron.
 */
export const uiErrorLog = mysqlTable("ui_error_log", {
  id: int("id").autoincrement().primaryKey(),
  /** Who triggered the error — 'owner' or agent slug like 'peter', 'steven', etc. */
  actor: varchar("actor", { length: 100 }).notNull().default("unknown"),
  /** The tRPC procedure or UI action that failed, e.g. 'agent.getRoster', 'audit.run' */
  action: varchar("action", { length: 200 }).notNull(),
  /** Short error message or code */
  errorMessage: text("error_message").notNull(),
  /** Full stack trace or additional context (optional) */
  errorDetail: text("error_detail"),
  /** Broad category for grouping in the healer: 'fub_api' | 'roster' | 'audit' | 'sms' | 'queue' | 'auth' | 'ui_crash' | 'other' */
  category: varchar("category", { length: 50 }).notNull().default("other"),
  /** Whether the nightly healer has already processed and fixed this error */
  resolved: mysqlEnum("resolved", ["no", "yes", "unfixable"]).notNull().default("no"),
  /** What fix the healer applied (filled in by nightly_health.py) */
  fixApplied: text("fix_applied"),
  /** When the error occurred */
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /** When the healer resolved it */
  resolvedAt: timestamp("resolved_at"),
});

export type UiErrorLog = typeof uiErrorLog.$inferSelect;
export type InsertUiErrorLog = typeof uiErrorLog.$inferInsert;

/**
 * Tracks which leads were texted via the Power Queue today.
 * Persists across server restarts so the queue never shows already-texted leads.
 * Rows are automatically filtered by date (CT) so old rows are harmless.
 * Pruned weekly by the cleanup cron.
 */
export const smsSentToday = mysqlTable("sms_sent_today", {
  id: int("id").autoincrement().primaryKey(),
  /** FUB person ID of the lead that was texted */
  personId: int("person_id").notNull(),
  /** Agent name who sent the text */
  agentName: varchar("agent_name", { length: 100 }).notNull().default("unknown"),
  /** Calendar date in CT (YYYY-MM-DD) — used to filter today's sends */
  sentDate: varchar("sent_date", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SmsSentToday = typeof smsSentToday.$inferSelect;
export type InsertSmsSentToday = typeof smsSentToday.$inferInsert;
export const botRunLog = mysqlTable("bot_run_log", {
  id: int("id").autoincrement().primaryKey(),
  runAt: timestamp("run_at").defaultNow().notNull(),
  leadsTexted: int("leads_texted").notNull().default(0),
  leadsFailed: int("leads_failed").notNull().default(0),
  leadsEvaluated: int("leads_evaluated").notNull().default(0),
  emailSent: mysqlEnum("email_sent", ["yes", "no", "skipped"]).notNull().default("no"),
  summary: text("summary"),
  triggeredBy: mysqlEnum("triggered_by", ["cron", "manual"]).notNull().default("cron"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type BotRunLog = typeof botRunLog.$inferSelect;
export type InsertBotRunLog = typeof botRunLog.$inferInsert;

/**
 * Autonomous monitoring engine run log.
 * Every 30-minute monitor run records what it checked, found, and fixed.
 * Surfaces in the dashboard "System Monitor" section so the team can see
 * the bot's health-check activity without opening logs.
 */
export const botMonitorLog = mysqlTable("bot_monitor_log", {
  id: int("id").autoincrement().primaryKey(),
  runAt: timestamp("run_at").defaultNow().notNull(),
  checksRun: int("checks_run").default(0).notNull(),
  issuesFound: int("issues_found").default(0).notNull(),
  issuesFixed: int("issues_fixed").default(0).notNull(),
  /** JSON array of {check, status, detail} — full findings list */
  findings: text("findings"),
  summary: text("summary"),
  triggeredBy: varchar("triggered_by", { length: 20 }).default("cron").notNull(),
  durationMs: int("duration_ms").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BotMonitorLog = typeof botMonitorLog.$inferSelect;
export type InsertBotMonitorLog = typeof botMonitorLog.$inferInsert;

/**
 * Unified observation log written by every automated bot in the system.
 * Acts as the shared "nervous system" — all bots write here, both nightly
 * healers read here. This is how the system sees itself.
 *
 * Sources: bot_monitor | lifestyle_bot | speed_to_lead | pond_nurture |
 *          nightly_healer | ui_error (promoted from ui_error_log)
 *
 * Severity: info | warning | error | fixed
 *   - info    = routine activity (bot ran, X leads texted)
 *   - warning = something unusual but not broken
 *   - error   = something is broken and needs fixing
 *   - fixed   = was an error, healer auto-fixed it overnight
 */
export const botObservations = mysqlTable("bot_observations", {
  id: int("id").autoincrement().primaryKey(),
  /** Which system wrote this observation */
  source: varchar("source", { length: 50 }).notNull(), // 'bot_monitor' | 'lifestyle_bot' | 'speed_to_lead' | 'pond_nurture' | 'nightly_healer' | 'ui_error'
  /** Severity level */
  severity: mysqlEnum("severity", ["info", "warning", "error", "fixed"]).notNull(),
  /** Broad category for healer routing */
  category: varchar("category", { length: 80 }).notNull(), // e.g. 'fub_api', 'bot_health', 'lead_accuracy', 'smtp', 'speed_to_lead', 'pond_nurture'
  /** Short human-readable message (shown in UI feed) */
  message: varchar("message", { length: 255 }).notNull(),
  /** Full detail / context (JSON string or plain text) */
  detail: text("detail"),
  /** Whether the nightly healer can auto-fix this */
  autoFixable: int("auto_fixable").default(0).notNull(), // 0 = no, 1 = yes
  /** When the healer fixed this (null = not yet fixed) */
  fixedAt: timestamp("fixed_at"),
  /** What fix was applied */
  fixNote: text("fix_note"),
  /** Run ID so related observations from one bot run can be grouped */
  runId: varchar("run_id", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BotObservation = typeof botObservations.$inferSelect;
export type InsertBotObservation = typeof botObservations.$inferInsert;

/**
 * Deduplication table for the automated reply intent detector.
 * Tracks every Gmail message ID that has already been processed so the handler
 * never re-classifies the same email twice across runs.
 *
 * Source: reply_intent_handler (runs every 2 hours via heartbeat cron)
 */
export const replyIntentProcessed = mysqlTable("reply_intent_processed", {
  id: int("id").autoincrement().primaryKey(),
  /** Gmail message UID (numeric) — unique per mailbox */
  gmailMessageId: varchar("gmail_message_id", { length: 64 }).notNull().unique(),
  /** Sender email address (lead's email) */
  senderEmail: varchar("sender_email", { length: 320 }).notNull(),
  /** FUB person ID if the lead was found in FUB (null if not found) */
  fubPersonId: int("fub_person_id"),
  /** What action was taken: 'opted_out' | 'no_intent' | 'not_in_fub' | 'already_opted_out' */
  action: varchar("action", { length: 50 }).notNull(),
  /** LLM confidence score 0.0-1.0 */
  confidence: varchar("confidence", { length: 10 }),
  /** Short reason from LLM classifier */
  reason: varchar("reason", { length: 500 }),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

export type ReplyIntentProcessed = typeof replyIntentProcessed.$inferSelect;
export type InsertReplyIntentProcessed = typeof replyIntentProcessed.$inferInsert;
