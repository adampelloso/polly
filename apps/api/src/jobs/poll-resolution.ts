/**
 * Resolution polling job — checks Polymarket for event outcomes every 60s.
 * When all events resolve, triggers compute-payouts directly.
 */

import { type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { checkResolution } from "../services/polymarket-client";
import { resolveEvent, getContest } from "../services/contest-manager";
import { payoutQueue, cancelResolutionPolling } from "./queue";

export interface PollResolutionData {
  contestId: string;
}

export async function processPollResolution(job: Job<PollResolutionData>) {
  const { contestId } = job.data;

  const contest = await getContest(contestId);
  if (!contest || contest.status !== "closed") {
    // Stop polling — remove repeatable job
    await cancelResolutionPolling(contestId);
    return;
  }

  const events = await db.query.contestEvents.findMany({
    where: eq(schema.contestEvents.contestId, contestId),
  });

  const unresolved = events.filter((e) => e.status === "pending");

  if (unresolved.length === 0) {
    // All resolved — trigger scoring
    await cancelResolutionPolling(contestId);
    await payoutQueue.add(`score-${contestId}`, { contestId });
    return;
  }

  // Check each unresolved event
  for (const event of unresolved) {
    const result = await checkResolution(event.polymarketConditionId);
    if (result.resolved && result.winningOutcome) {
      await resolveEvent(event.id, result.winningOutcome);
    }
  }

  // Check if all now resolved
  const stillUnresolved = await db.query.contestEvents.findMany({
    where: eq(schema.contestEvents.contestId, contestId),
  });
  const pending = stillUnresolved.filter((e) => e.status === "pending");

  if (pending.length === 0) {
    await cancelResolutionPolling(contestId);
    await payoutQueue.add(`score-${contestId}`, { contestId });
  }
}
