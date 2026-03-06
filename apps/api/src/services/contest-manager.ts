/**
 * Contest lifecycle manager.
 *
 * State machine: draft → active → closed → resolved
 *                  ↘ voided (from any pre-resolved state)
 */

import { eq, and, sql, inArray } from "drizzle-orm";
import { PublicKey } from "@solana/web3.js";
import { db, schema } from "../db";
import {
  type ContestStatus,
  type CreateContestRequest,
  type SubmitEntryRequest,
} from "@polypool/shared";
import { getEntryOdds } from "./polymarket-client";
import { verifyEntryPayment } from "./payment-verifier";
import { rankStandings } from "./standings";
import { initializeVaultContest } from "./vault-client";
import {
  scheduleContestClose,
  cancelContestClose,
  scheduleResolutionPolling,
  cancelResolutionPolling,
  scheduleContestRefund,
} from "../jobs/queue";
import {
  broadcastContestStatus,
  broadcastEventResolution,
  broadcastPoolUpdate,
} from "../websocket/server";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["active", "voided"],
  active: ["closed", "voided"],
  closed: ["resolved", "voided"],
  resolved: [],
  voided: [],
  cancelled: [],
};

function canTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

function canUseDevVaultFallback(): boolean {
  if (process.env.ALLOW_DEV_VAULT_FALLBACK === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function isMissingProgramError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("program that does not exist") ||
    lower.includes("attempt to load a program that does not exist")
  );
}

function getFallbackVaultAddress(): string {
  const candidate = process.env.TREASURY_WALLET;
  if (!candidate) {
    throw new Error(
      "TREASURY_WALLET is required for dev vault fallback when on-chain program is unavailable"
    );
  }
  try {
    return new PublicKey(candidate).toBase58();
  } catch {
    throw new Error("TREASURY_WALLET is not a valid Solana public key");
  }
}

// ── Contest CRUD ──

export async function createContest(input: CreateContestRequest) {
  const autoInitVault = process.env.AUTO_INIT_CONTEST_VAULTS === "true";
  if (autoInitVault && input.vaultAddress) {
    throw new Error("Do not provide vaultAddress when AUTO_INIT_CONTEST_VAULTS is enabled");
  }

  const [contest] = await db
    .insert(schema.contests)
    .values({
      title: input.title,
      description: input.description,
      category: input.category,
      status: "draft",
      entryFeeUsdc: String(input.entryFeeUsdc),
      rakeBps: input.rakeBps,
      minEntries: input.minEntries,
      maxEntries: input.maxEntries ?? null,
      vaultAddress: input.vaultAddress ?? null,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
    })
    .returning();

  // Insert events
  if (input.events.length > 0) {
    await db.insert(schema.contestEvents).values(
      input.events.map((evt) => ({
        contestId: contest.id,
        polymarketSlug: evt.polymarketSlug,
        polymarketConditionId: evt.polymarketConditionId,
        eventTitle: evt.eventTitle,
        outcomes: evt.outcomes,
        sortOrder: evt.sortOrder,
      }))
    );
  }

  return contest;
}

export async function getContest(id: string) {
  const contest = await db.query.contests.findFirst({
    where: eq(schema.contests.id, id),
  });
  return contest ?? null;
}

export async function getContestWithEvents(id: string) {
  const contest = await db.query.contests.findFirst({
    where: eq(schema.contests.id, id),
  });
  if (!contest) return null;

  const events = await db.query.contestEvents.findMany({
    where: eq(schema.contestEvents.contestId, id),
    orderBy: (e, { asc }) => [asc(e.sortOrder)],
  });

  return {
    ...contest,
    entryFeeUsdc: parseFloat(contest.entryFeeUsdc),
    totalPoolUsdc: parseFloat(contest.totalPoolUsdc),
    rakeBps: contest.rakeBps,
    events,
  };
}

export async function listContests(filters?: {
  status?: string;
  category?: string;
}) {
  const conditions = [];
  if (filters?.status) {
    conditions.push(
      eq(schema.contests.status, filters.status as ContestStatus)
    );
  }
  if (filters?.category) {
    conditions.push(eq(schema.contests.category, filters.category as any));
  }

  const contests = await db.query.contests.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: (c, { asc }) => [asc(c.closesAt)],
  });

  // Get event counts for all returned contests
  const contestIds = contests.map((c) => c.id);
  const eventCounts: Record<string, number> = {};

  if (contestIds.length > 0) {
    const counts = await db
      .select({
        contestId: schema.contestEvents.contestId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.contestEvents)
      .where(inArray(schema.contestEvents.contestId, contestIds))
      .groupBy(schema.contestEvents.contestId);

    for (const row of counts) {
      eventCounts[row.contestId] = row.count;
    }
  }

  return contests.map((c) => ({
    id: c.id,
    title: c.title,
    category: c.category,
    status: c.status,
    entryFeeUsdc: parseFloat(c.entryFeeUsdc),
    totalEntries: c.totalEntries,
    totalPoolUsdc: parseFloat(c.totalPoolUsdc),
    closesAt: c.closesAt?.toISOString() ?? null,
    eventCount: eventCounts[c.id] ?? 0,
  }));
}

// ── Status Transitions ──

export async function transitionContest(
  contestId: string,
  newStatus: ContestStatus
) {
  let contest = await getContest(contestId);
  if (!contest) throw new Error(`Contest ${contestId} not found`);

  if (!canTransition(contest.status, newStatus)) {
    throw new Error(
      `Invalid transition: ${contest.status} → ${newStatus}`
    );
  }

  if (newStatus === "voided") {
    return voidContest(contestId);
  }

  if (newStatus === "active") {
    if (!contest.closesAt) {
      throw new Error("Contest cannot be activated without a close time");
    }
    if (contest.closesAt.getTime() <= Date.now()) {
      throw new Error("Contest close time must be in the future before activation");
    }

    if (!contest.vaultAddress && process.env.AUTO_INIT_CONTEST_VAULTS === "true") {
      try {
        const initialized = await initializeVaultContest({
          contestId: contest.id,
          entryFeeUsdc: parseFloat(contest.entryFeeUsdc),
        });
        await db
          .update(schema.contests)
          .set({ vaultAddress: initialized.vaultAddress })
          .where(eq(schema.contests.id, contest.id));
        contest = { ...contest, vaultAddress: initialized.vaultAddress };
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown initialization error";
        if (canUseDevVaultFallback() && isMissingProgramError(message)) {
          const fallbackVaultAddress = getFallbackVaultAddress();
          await db
            .update(schema.contests)
            .set({ vaultAddress: fallbackVaultAddress })
            .where(eq(schema.contests.id, contest.id));
          contest = { ...contest, vaultAddress: fallbackVaultAddress };
          console.warn(
            `[vault-fallback] Contest ${contest.id} activated with TREASURY_WALLET because POLYPOOL_PROGRAM_ID is unavailable`
          );
        } else {
          throw new Error(`Contest vault initialization failed: ${message}`);
        }
      }
    }

    if (!contest.vaultAddress) {
      throw new Error("Contest cannot be activated without a vault address");
    }
  }

  const updateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === "resolved") {
    updateData.resolvedAt = new Date();
  }

  await db
    .update(schema.contests)
    .set(updateData)
    .where(eq(schema.contests.id, contestId));

  if (newStatus === "active" && contest.closesAt) {
    await scheduleContestClose(contestId, contest.closesAt);
  }

  if (newStatus !== "active") {
    await cancelContestClose(contestId).catch(() => {});
  }

  if (newStatus === "closed") {
    await scheduleResolutionPolling(contestId);
  }

  if (newStatus === "resolved") {
    await cancelResolutionPolling(contestId).catch(() => {});
  }

  broadcastContestStatus(contestId, newStatus);
  return { ...contest, status: newStatus };
}

// ── Void Contest ──

export async function voidContest(contestId: string) {
  const contest = await getContest(contestId);
  if (!contest) throw new Error(`Contest ${contestId} not found`);

  if (contest.status === "resolved" || contest.status === "voided") {
    throw new Error(`Cannot void contest in ${contest.status} status`);
  }

  await db
    .update(schema.contests)
    .set({ status: "voided" })
    .where(eq(schema.contests.id, contestId));

  await cancelContestClose(contestId).catch(() => {});
  await cancelResolutionPolling(contestId).catch(() => {});
  await scheduleContestRefund(contestId);
  broadcastContestStatus(contestId, "voided");

  return { ...contest, status: "voided" as const };
}

// ── Entry Submission ──

export async function submitEntry(
  contestId: string,
  input: SubmitEntryRequest
) {
  const contest = await getContest(contestId);
  if (!contest) throw new Error(`Contest ${contestId} not found`);

  if (contest.status !== "active") {
    throw new Error(`Contest is ${contest.status}, not accepting entries`);
  }

  if (!contest.vaultAddress) {
    throw new Error("Contest vault is not configured");
  }

  if (contest.closesAt && new Date() >= contest.closesAt) {
    throw new Error("Contest entry window has closed");
  }

  if (
    contest.maxEntries !== null &&
    contest.totalEntries >= contest.maxEntries
  ) {
    throw new Error("Contest is full");
  }

  // Validate picks cover all events exactly once
  const events = await db.query.contestEvents.findMany({
    where: eq(schema.contestEvents.contestId, contestId),
  });
  const eventIds = new Set(events.map((e) => e.id));
  const pickedEventIds = new Set<string>();

  if (input.picks.length !== events.length) {
    throw new Error("Entry must include exactly one pick for each event");
  }

  for (const pick of input.picks) {
    if (!eventIds.has(pick.eventId)) {
      throw new Error(`Invalid event ID in picks: ${pick.eventId}`);
    }
    if (pickedEventIds.has(pick.eventId)) {
      throw new Error(`Duplicate pick for event: ${pick.eventId}`);
    }
    pickedEventIds.add(pick.eventId);

    const event = events.find((e) => e.id === pick.eventId);
    const validOutcomes = new Set(
      ((event?.outcomes as Array<{ label: string; tokenId: string }> | undefined) ?? []).map(
        (o) => o.label
      )
    );
    if (!validOutcomes.has(pick.pickedOutcome)) {
      throw new Error(`Invalid outcome "${pick.pickedOutcome}" for event ${pick.eventId}`);
    }
  }

  // Fetch current odds from Polymarket at entry time
  const conditionIds = events.map((e) => e.polymarketConditionId);
  const oddsMap = await getEntryOdds(conditionIds);

  // Build odds snapshot keyed by eventId -> outcome label -> probability
  const oddsSnapshot: Record<string, Record<string, number>> = {};
  for (const event of events) {
    const odds = oddsMap[event.polymarketConditionId];
    if (odds && Object.keys(odds).length > 0) {
      oddsSnapshot[event.id] = odds;
    } else {
      throw new Error(`Could not fetch entry odds for event ${event.id}`);
    }
  }

  // Insert entry with odds snapshot
  await verifyEntryPayment({
    txSignature: input.txSignature,
    walletAddress: input.walletAddress,
    vaultAddress: contest.vaultAddress,
    amountUsdc: parseFloat(contest.entryFeeUsdc),
  });

  const entryFee = parseFloat(contest.entryFeeUsdc);

  try {
    const entry = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(schema.entries)
        .values({
          contestId,
          walletAddress: input.walletAddress,
          picks: input.picks,
          oddsSnapshot,
          entryTxSignature: input.txSignature,
        })
        .returning();

      await tx
        .update(schema.contests)
        .set({
          totalEntries: sql`${schema.contests.totalEntries} + 1`,
          totalPoolUsdc: sql`${schema.contests.totalPoolUsdc} + ${entryFee}`,
        })
        .where(eq(schema.contests.id, contestId));

      return inserted;
    });

    const refreshed = await getContest(contestId);
    if (refreshed) {
      broadcastPoolUpdate(
        contestId,
        refreshed.totalEntries,
        parseFloat(refreshed.totalPoolUsdc)
      );
    }

    return entry;
  } catch (err) {
    const maybeDbError = err as { code?: string } | undefined;
    if (maybeDbError?.code === "23505") {
      throw new Error("Duplicate payment transaction signature");
    }
    throw err;
  }
}

// ── Standings & Results ──

export async function getStandings(contestId: string) {
  const entries = await db.query.entries.findMany({
    where: eq(schema.entries.contestId, contestId),
    orderBy: (e, { desc }) => [desc(e.score)],
  });

  return rankStandings(entries);
}

// ── Scoring Results ──

export async function saveEntryScores(
  results: Array<{
    entryId: string;
    score: number;
    correctCount: number;
    payoutUsdc: number;
  }>
) {
  for (const r of results) {
    await db
      .update(schema.entries)
      .set({
        score: String(r.score),
        correctCount: r.correctCount,
        payoutUsdc: String(r.payoutUsdc),
        scoredAt: new Date(),
      })
      .where(eq(schema.entries.id, r.entryId));
  }
}

// ── Event Resolution ──

export async function resolveEvent(
  eventId: string,
  outcome: string
) {
  const [event] = await db
    .select({
      id: schema.contestEvents.id,
      contestId: schema.contestEvents.contestId,
    })
    .from(schema.contestEvents)
    .where(eq(schema.contestEvents.id, eventId))
    .limit(1);

  await db
    .update(schema.contestEvents)
    .set({
      resolvedOutcome: outcome,
      resolvedAt: new Date(),
      status: "resolved",
    })
    .where(eq(schema.contestEvents.id, eventId));

  if (event) {
    broadcastEventResolution(event.contestId, eventId, outcome);
  }
}

export async function voidEvent(eventId: string) {
  await db
    .update(schema.contestEvents)
    .set({
      status: "voided",
      resolvedAt: new Date(),
    })
    .where(eq(schema.contestEvents.id, eventId));
}
