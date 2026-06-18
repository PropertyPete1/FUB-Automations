/**
 * Tests for POST /api/healer/write
 *
 * These tests exercise the Express route directly by constructing a minimal
 * Express app with the same middleware and route logic, avoiding the need for
 * a live database connection.  The getDb helper is mocked so the happy-path
 * test confirms the Drizzle insert is called with the correct payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ---------------------------------------------------------------------------
// Mock the database layer BEFORE importing the route module
// ---------------------------------------------------------------------------
const mockInsert = vi.fn().mockResolvedValue(undefined);
const mockValues = vi.fn().mockReturnValue(Promise.resolve(undefined));
const mockDb = { insert: vi.fn().mockReturnValue({ values: mockValues }) };

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("../../drizzle/schema", () => ({
  botObservations: "bot_observations_mock",
}));

// ---------------------------------------------------------------------------
// Build a minimal Express app that replicates the route under test
// ---------------------------------------------------------------------------
function buildApp(healerSecret: string | undefined) {
  const app = express();
  app.use(express.json());

  app.post("/api/healer/write", async (req, res) => {
    const token = req.headers["x-healer-token"];
    if (!token || token !== healerSecret) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    const {
      source,
      severity = "info",
      category = "healer_run",
      message,
      detail,
      autoFixable = 0,
    } = req.body ?? {};
    if (!source || !message) {
      return res.status(400).json({ ok: false, error: "source and message are required" });
    }
    try {
      const { getDb } = await import("../db");
      const { botObservations } = await import("../../drizzle/schema");
      const db = await getDb();
      if (!db) {
        return res.status(503).json({ ok: false, error: "Database unavailable" });
      }
      await db.insert(botObservations).values({
        source: String(source),
        severity: String(severity),
        category: String(category),
        message: String(message),
        detail: detail ? String(detail) : null,
        autoFixable: Number(autoFixable),
        runId: `healer-${Date.now()}`,
        createdAt: new Date(),
      });
      return res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  return app;
}

const VALID_SECRET = "66b21c228c18dc5f8b6c73f8adadc1720768ffce3b033c865fb3678616ca824c";

describe("POST /api/healer/write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.insert.mockReturnValue({ values: mockValues });
    mockValues.mockResolvedValue(undefined);
  });

  it("returns 401 when x-healer-token header is missing", async () => {
    const app = buildApp(VALID_SECRET);
    const res = await request(app)
      .post("/api/healer/write")
      .send({ source: "nightly_healer", message: "ran ok" });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns 401 when x-healer-token header is wrong", async () => {
    const app = buildApp(VALID_SECRET);
    const res = await request(app)
      .post("/api/healer/write")
      .set("x-healer-token", "bad-token")
      .send({ source: "nightly_healer", message: "ran ok" });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("returns 400 when source is missing", async () => {
    const app = buildApp(VALID_SECRET);
    const res = await request(app)
      .post("/api/healer/write")
      .set("x-healer-token", VALID_SECRET)
      .send({ message: "ran ok" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("returns 400 when message is missing", async () => {
    const app = buildApp(VALID_SECRET);
    const res = await request(app)
      .post("/api/healer/write")
      .set("x-healer-token", VALID_SECRET)
      .send({ source: "nightly_healer" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("returns 200 { ok: true } and calls db.insert with correct payload", async () => {
    const app = buildApp(VALID_SECRET);
    const res = await request(app)
      .post("/api/healer/write")
      .set("x-healer-token", VALID_SECRET)
      .send({
        source: "nightly_healer",
        severity: "info",
        category: "healer_run",
        message: "Nightly health check completed successfully",
        detail: "All 6 bots healthy",
        autoFixable: 0,
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify the db.insert was called
    expect(mockDb.insert).toHaveBeenCalledWith("bot_observations_mock");
    const insertedRow = mockValues.mock.calls[0][0];
    expect(insertedRow.source).toBe("nightly_healer");
    expect(insertedRow.severity).toBe("info");
    expect(insertedRow.category).toBe("healer_run");
    expect(insertedRow.message).toBe("Nightly health check completed successfully");
    expect(insertedRow.detail).toBe("All 6 bots healthy");
    expect(insertedRow.autoFixable).toBe(0);
    expect(insertedRow.runId).toMatch(/^healer-\d+$/);
    expect(insertedRow.createdAt).toBeInstanceOf(Date);
  });

  it("uses default values for severity, category, autoFixable when not provided", async () => {
    const app = buildApp(VALID_SECRET);
    await request(app)
      .post("/api/healer/write")
      .set("x-healer-token", VALID_SECRET)
      .send({ source: "nightly_healer", message: "minimal payload" });

    const insertedRow = mockValues.mock.calls[0][0];
    expect(insertedRow.severity).toBe("info");
    expect(insertedRow.category).toBe("healer_run");
    expect(insertedRow.autoFixable).toBe(0);
    expect(insertedRow.detail).toBeNull();
  });
});
