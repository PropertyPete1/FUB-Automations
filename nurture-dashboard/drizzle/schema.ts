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
 * Bot observation records written by nightly_health.py and the botMonitor.
 * source='nightly_healer' rows confirm the healer ran successfully.
 */
export const botObservations = mysqlTable("bot_observations", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 64 }).notNull(),
  severity: varchar("severity", { length: 16 }).notNull().default("info"),
  category: varchar("category", { length: 64 }).notNull().default("healer_run"),
  message: text("message").notNull(),
  detail: text("detail"),
  autoFixable: int("autoFixable").notNull().default(0),
  runId: varchar("runId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BotObservation = typeof botObservations.$inferSelect;
export type InsertBotObservation = typeof botObservations.$inferInsert;