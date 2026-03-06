import { Router, type NextFunction, type Request, type Response } from "express";
import { getQueueStats } from "../jobs/queue";

const router: ReturnType<typeof Router> = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-admin-key"];
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || apiKey !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.get("/queues", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { stats, alerts } = await getQueueStats();
    res.json({
      timestamp: new Date().toISOString(),
      queues: stats,
      alerts,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch queue stats" });
  }
});

export default router;
