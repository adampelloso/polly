/**
 * Compute payouts job — runs winner-take-all scoring engine and saves results.
 */

import { type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import {
  scoreContest,
  type EntryInput,
  type EventInput,
} from "../services/scoring-engine";
import { flattenOddsSnapshot } from "../services/snapshot-utils";
import {
  transitionContest,
  getContest,
  saveEntryScores,
} from "../services/contest-manager";
import { scheduleContestDistribution } from "./queue";
import { broadcastLeaderboardUpdate } from "../websocket/server";

export interface ComputePayoutsData {
  contestId: string;
}

export async function processComputePayouts(job: Job<ComputePayoutsData>) {
  const { contestId } = job.data;

  const contest = await getContest(contestId);
  if (!contest) return;

  const events = await db.query.contestEvents.findMany({
    where: eq(schema.contestEvents.contestId, contestId),
  });

  const entries = await db.query.entries.findMany({
    where: eq(schema.entries.contestId, contestId),
  });

  // Build scoring input
  const eventInputs: EventInput[] = events.map((e) => ({
    eventId: e.id,
    resolvedOutcome: e.resolvedOutcome,
    voided: e.status === "voided",
  }));

  const entryInputs: EntryInput[] = entries.map((e) => {
    return {
      entryId: e.id,
      walletAddress: e.walletAddress,
      enteredAt: e.enteredAt,
      picks: (e.picks as Array<{ eventId: string; pickedOutcome: string }>) ?? [],
      oddsSnapshot: flattenOddsSnapshot(e.oddsSnapshot),
    };
  });

  const result = scoreContest({
    entries: entryInputs,
    events: eventInputs,
    totalPoolUsdc: parseFloat(contest.totalPoolUsdc),
    rakeBps: contest.rakeBps,
  });

  // Save scores to entries
  await saveEntryScores(
    result.scoredEntries.map((se) => ({
      entryId: se.entryId,
      score: se.score,
      correctCount: se.correctCount,
      payoutUsdc: se.payoutUsdc,
    }))
  );

  broadcastLeaderboardUpdate(
    contestId,
    result.scoredEntries.map((entry) => ({
      walletAddress: entry.walletAddress,
      score: entry.score,
      correctCount: entry.correctCount,
      rank: entry.rank,
    }))
  );

  // Store winner on contest
  const winner = result.scoredEntries.find((e) => e.payoutUsdc > 0);
  if (winner) {
    await db
      .update(schema.contests)
      .set({ winnerEntryId: winner.entryId })
      .where(eq(schema.contests.id, contestId));
  }

  // Transition to resolved
  await transitionContest(contestId, "resolved");

  // Queue payout distribution
  await scheduleContestDistribution(contestId, result.rakeAmount);
}
