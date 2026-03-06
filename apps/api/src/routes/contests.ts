import { Router, type Request, type Response, type NextFunction } from "express";

type IdParams = { id: string };
import { z } from "zod";
import {
  createContest,
  getContestWithEvents,
  listContests,
  submitEntry,
  getStandings,
  transitionContest,
  voidContest,
} from "../services/contest-manager";
import { getPrices } from "../services/polymarket-client";

const router: ReturnType<typeof Router> = Router();

// ── Admin Auth Middleware ──

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-admin-key"];
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || apiKey !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ── Validation Schemas ──

const createContestSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().default(""),
    category: z.enum(["sports", "politics", "crypto", "culture", "mixed"]),
    entryFeeUsdc: z.number().positive(),
    rakeBps: z.number().int().min(0).max(5000).default(1000),
    minEntries: z.number().int().positive().default(2),
    maxEntries: z.number().int().positive().nullable().optional(),
    vaultAddress: z.string().min(32).max(64).nullable().optional(),
    closesAt: z.string().datetime().optional(),
    events: z
      .array(
        z.object({
          polymarketSlug: z.string(),
          polymarketConditionId: z.string(),
          eventTitle: z.string(),
          outcomes: z
            .array(
              z.object({
                label: z.string(),
                tokenId: z.string(),
              })
            )
            .min(2, "Each event must include at least two outcomes"),
          sortOrder: z.number().int().default(0),
        })
      )
      .min(1, "Contest must include at least one event"),
  })
  .refine(
    (data) => {
      if (!data.closesAt) return true;
      return new Date(data.closesAt).getTime() > Date.now();
    },
    {
      path: ["closesAt"],
      message: "closesAt must be in the future",
    }
  )
  .refine(
    (data) => {
      if (data.maxEntries == null) return true;
      return data.maxEntries >= data.minEntries;
    },
    {
      path: ["maxEntries"],
      message: "maxEntries must be greater than or equal to minEntries",
    }
  );

const submitEntrySchema = z.object({
  walletAddress: z.string().min(1),
  picks: z.array(
    z.object({
      eventId: z.string().uuid(),
      pickedOutcome: z.string(),
    })
  ),
  txSignature: z.string().min(1),
});

const transitionSchema = z.object({
  status: z.enum(["active", "closed", "voided"]),
});

// ── Routes ──

// GET /api/contests
router.get("/", async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const contests = await listContests({ status, category });
    res.json(contests);
  } catch (err) {
    res.status(500).json({ error: "Failed to list contests" });
  }
});

// POST /api/contests (admin)
router.post("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const parsed = createContestSchema.parse(req.body);
    const contest = await createContest(parsed);
    res.status(201).json(contest);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: err.errors });
      return;
    }
    console.error("Create contest failed:", err);
    if (err instanceof Error) {
      res.status(500).json({
        error:
          process.env.NODE_ENV === "production"
            ? "Failed to create contest"
            : `Failed to create contest: ${err.message}`,
      });
      return;
    }
    res.status(500).json({ error: "Failed to create contest" });
  }
});

// GET /api/contests/:id
router.get("/:id", async (req: Request<IdParams>, res: Response) => {
  try {
    const contest = await getContestWithEvents(req.params.id);
    if (!contest) {
      res.status(404).json({ error: "Contest not found" });
      return;
    }
    res.json(contest);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contest" });
  }
});

// POST /api/contests/:id/enter
router.post("/:id/enter", async (req: Request<IdParams>, res: Response) => {
  try {
    const parsed = submitEntrySchema.parse(req.body);
    const entry = await submitEntry(req.params.id, parsed);
    res.status(201).json(entry);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: err.errors });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Failed to submit entry" });
  }
});

// GET /api/contests/:id/standings
router.get("/:id/standings", async (req: Request<IdParams>, res: Response) => {
  try {
    const standings = await getStandings(req.params.id);
    res.json(standings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch standings" });
  }
});

// GET /api/contests/:id/odds
router.get("/:id/odds", async (req: Request<IdParams>, res: Response) => {
  try {
    const contest = await getContestWithEvents(req.params.id);
    if (!contest) {
      res.status(404).json({ error: "Contest not found" });
      return;
    }

    const odds: Record<string, Record<string, number>> = {};
    await Promise.all(
      contest.events.map(async (event) => {
        const prices = await getPrices(event.polymarketConditionId);
        odds[event.id] = prices;
      })
    );

    res.json(odds);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch odds" });
  }
});

// POST /api/contests/:id/transition (admin)
router.post("/:id/transition", requireAdmin, async (req: Request<IdParams>, res: Response) => {
  try {
    const parsed = transitionSchema.parse(req.body);
    const contest = await transitionContest(req.params.id, parsed.status);
    res.json(contest);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: err.errors });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Failed to transition contest" });
  }
});

// POST /api/contests/:id/void (admin)
router.post("/:id/void", requireAdmin, async (req: Request<IdParams>, res: Response) => {
  try {
    const contest = await voidContest(req.params.id);
    res.json(contest);
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Failed to void contest" });
  }
});

export default router;
