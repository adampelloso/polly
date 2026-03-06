import "dotenv/config";
import express, { type Express } from "express";
import cors from "cors";
import { createServer } from "http";
import { sql } from "drizzle-orm";

import contestsRouter from "./routes/contests";
import marketsRouter from "./routes/markets";
import opsRouter from "./routes/ops";
import { initWebSocket } from "./websocket/server";
import { startWorkers } from "./jobs";
import { db } from "./db";
import { pingRedis } from "./jobs/queue";

const app: Express = express();
const port = parseInt(process.env.PORT ?? "3001", 10);

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json());

// Routes
app.use("/api/contests", contestsRouter);
app.use("/api/markets", marketsRouter);
app.use("/api/ops", opsRouter);

// Health check
app.get("/api/health", async (_req, res) => {
  const timestamp = new Date().toISOString();
  const redisEnabled = Boolean(process.env.REDIS_URL);

  let dbOk = false;
  try {
    await db.execute(sql`select 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const redisOk = redisEnabled ? await pingRedis() : true;
  const healthy = dbOk && redisOk;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    timestamp,
    dependencies: {
      database: dbOk ? "ok" : "down",
      redis: redisOk ? "ok" : redisEnabled ? "down" : "disabled",
    },
  });
});

// Create HTTP server and attach WebSocket
const server = createServer(app);
initWebSocket(server);

// Start job workers
if (process.env.REDIS_URL) {
  startWorkers();
}

server.listen(port, () => {
  console.log(`Polly API running on port ${port}`);
});

export { app };
