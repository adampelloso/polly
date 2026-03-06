import { Router, type Request, type Response } from "express";
import { searchEvents, fetchMarket, fetchEventBySlug } from "../services/polymarket-client";

const router: ReturnType<typeof Router> = Router();

// GET /api/markets/search?q=...&tag=...
router.get("/search", async (req: Request, res: Response) => {
  try {
    const { q, tag, limit } = req.query;
    const events = await searchEvents(
      q as string | undefined,
      tag as string | undefined,
      limit ? parseInt(limit as string, 10) : 20
    );
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: "Failed to search markets" });
  }
});

// GET /api/markets/event/:slug
router.get("/event/:slug", async (req: Request<{ slug: string }>, res: Response) => {
  try {
    const event = await fetchEventBySlug(req.params.slug);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch event" });
  }
});

// GET /api/markets/:conditionId
router.get("/:conditionId", async (req: Request<{ conditionId: string }>, res: Response) => {
  try {
    const market = await fetchMarket(req.params.conditionId);
    if (!market) {
      res.status(404).json({ error: "Market not found" });
      return;
    }
    res.json(market);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch market" });
  }
});

export default router;
