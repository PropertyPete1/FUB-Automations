import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db";
import { botObservations } from "../../drizzle/schema";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // POST /api/healer/write — nightly_health.py calls this after each run to confirm it ran
  app.post("/api/healer/write", async (req, res) => {
    const token = req.headers["x-healer-token"];
    if (!token || token !== process.env.HEALER_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    const { source, severity = "info", category = "healer_run", message, detail, autoFixable = 0 } = req.body ?? {};
    if (!source || !message) {
      return res.status(400).json({ ok: false, error: "source and message are required" });
    }
    try {
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
      console.error("[healer/write] DB insert failed:", msg);
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
