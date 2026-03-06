/**
 * Dev-resolve script — simulates the full resolution + scoring flow for a contest.
 *
 * Usage: CONTEST_ID=<uuid> pnpm dev:resolve
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import {
  transitionContest,
  resolveEvent,
  saveEntryScores,
} from "./services/contest-manager";
import { scoreContest, type ScoringInput } from "./services/scoring-engine";
import { flattenOddsSnapshot } from "./services/snapshot-utils";

async function main() {
  const contestId = process.env.CONTEST_ID;
  if (!contestId) {
    console.error("Usage: CONTEST_ID=<uuid> pnpm dev:resolve");
    process.exit(1);
  }

  // Fetch contest
  const contest = await db.query.contests.findFirst({
    where: eq(schema.contests.id, contestId),
  });
  if (!contest) {
    console.error(`Contest ${contestId} not found`);
    process.exit(1);
  }

  console.log(`Contest: ${contest.title} (${contest.status})`);

  // Fetch events
  const events = await db.query.contestEvents.findMany({
    where: eq(schema.contestEvents.contestId, contestId),
    orderBy: (e, { asc }) => [asc(e.sortOrder)],
  });

  if (events.length === 0) {
    console.error("No events found for this contest");
    process.exit(1);
  }

  console.log(`Events: ${events.length}\n`);

  // Step 1: Resolve each event (first outcome wins)
  console.log("Resolving events...");
  for (const event of events) {
    const outcomes = (event.outcomes as Array<{ label: string; tokenId: string }>) ?? [];
    const winningOutcome = outcomes[0]?.label ?? "Yes";
    await resolveEvent(event.id, winningOutcome);
    console.log(`  ${event.eventTitle} → ${winningOutcome}`);
  }

  // Step 2: Transition contest through active → closed → resolved
  console.log("\nTransitioning contest...");
  if (contest.status === "active") {
    await transitionContest(contestId, "closed");
    console.log("  active → closed");
  }

  const refreshed = await db.query.contests.findFirst({
    where: eq(schema.contests.id, contestId),
  });
  if (refreshed?.status === "closed") {
    // Score first, then transition to resolved
  }

  // Step 3: Fetch entries and score
  const entries = await db.query.entries.findMany({
    where: eq(schema.entries.contestId, contestId),
  });

  if (entries.length === 0) {
    console.log("\nNo entries to score. Done! (Submit entries via the UI first)");
    process.exit(0);
  }

  // Re-fetch events with resolved outcomes
  const resolvedEvents = await db.query.contestEvents.findMany({
    where: eq(schema.contestEvents.contestId, contestId),
  });

  const scoringInput: ScoringInput = {
    entries: entries.map((e) => {
      return {
        entryId: e.id,
        walletAddress: e.walletAddress,
        enteredAt: e.enteredAt,
        picks: e.picks as Array<{ eventId: string; pickedOutcome: string }>,
        oddsSnapshot: flattenOddsSnapshot(e.oddsSnapshot),
      };
    }),
    events: resolvedEvents.map((e) => ({
      eventId: e.id,
      resolvedOutcome: e.resolvedOutcome,
      voided: e.status === "voided",
    })),
    totalPoolUsdc: parseFloat(contest.totalPoolUsdc),
    rakeBps: contest.rakeBps,
  };

  console.log(`\nScoring ${entries.length} entries...`);
  const result = scoreContest(scoringInput);

  // Save scores
  await saveEntryScores(
    result.scoredEntries.map((e) => ({
      entryId: e.entryId,
      score: e.score,
      correctCount: e.correctCount,
      payoutUsdc: e.payoutUsdc,
    }))
  );

  // Transition to resolved
  if (refreshed?.status === "closed") {
    await transitionContest(contestId, "resolved");
    console.log("  closed → resolved");
  }

  // Print results
  console.log(`\nPrize pool: $${result.prizePool.toFixed(2)}`);
  console.log(`Rake: $${result.rakeAmount.toFixed(2)}\n`);

  console.log("Standings:");
  console.log("─".repeat(70));
  console.log(
    "Rank".padEnd(6) +
      "Wallet".padEnd(20) +
      "Score".padEnd(12) +
      "Correct".padEnd(10) +
      "Payout"
  );
  console.log("─".repeat(70));

  for (const entry of result.scoredEntries) {
    const wallet = entry.walletAddress.slice(0, 8) + "...";
    console.log(
      `#${entry.rank}`.padEnd(6) +
        wallet.padEnd(20) +
        entry.score.toFixed(4).padEnd(12) +
        `${entry.correctCount}/${resolvedEvents.length}`.padEnd(10) +
        `$${entry.payoutUsdc.toFixed(2)}`
    );
  }

  console.log("\nDone!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Dev-resolve failed:", err);
  process.exit(1);
});
