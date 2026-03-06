/**
 * Scoring engine for Polly contests — winner-take-all.
 *
 * Formula: score = SUM(1 / clamp(oddsAtEntry, 0.02, 0.98)) for correct picks only
 * Incorrect picks = 0. Voided markets excluded.
 *
 * Winner: highest score. Tiebreaker: earliest enteredAt.
 * Payout: rake = totalPool * (rakeBps / 10000), winner gets rest.
 * If tie (same score AND same timestamp): split evenly.
 */

import { MIN_PROBABILITY, MAX_PROBABILITY } from "@polypool/shared";

// ── Types ──

export interface ScoringInput {
  entries: EntryInput[];
  events: EventInput[];
  totalPoolUsdc: number;
  rakeBps: number;
}

export interface EntryInput {
  entryId: string;
  walletAddress: string;
  enteredAt: Date;
  picks: Array<{ eventId: string; pickedOutcome: string }>;
  oddsSnapshot: Record<string, number>; // eventId:outcome → probability at entry time
}

export interface EventInput {
  eventId: string;
  resolvedOutcome: string | null;
  voided: boolean;
}

export interface ScoringResult {
  scoredEntries: ScoredEntryResult[];
  totalPool: number;
  rakeAmount: number;
  prizePool: number;
  voidedEventCount: number;
}

export interface ScoredEntryResult {
  entryId: string;
  walletAddress: string;
  score: number;
  correctCount: number;
  rank: number;
  payoutUsdc: number;
  picks: ScoredPickResult[];
}

export interface ScoredPickResult {
  eventId: string;
  pickedOutcome: string;
  resolvedOutcome: string | null;
  correct: boolean;
  probability: number;
  pointsEarned: number;
  voided: boolean;
}

// ── Core Engine ──

function clampProbability(p: number): number {
  return Math.max(MIN_PROBABILITY, Math.min(MAX_PROBABILITY, p));
}

function getProbability(
  oddsSnapshot: Record<string, number>,
  eventId: string,
  pickedOutcome: string
): number {
  const exactKey = `${eventId}:${pickedOutcome}`;
  const exact = oddsSnapshot[exactKey];
  if (typeof exact === "number") return exact;

  const target = pickedOutcome.toLowerCase();
  const match = Object.entries(oddsSnapshot).find(([key]) => {
    const [snapshotEventId, snapshotOutcome] = key.split(":");
    return snapshotEventId === eventId && snapshotOutcome?.toLowerCase() === target;
  });
  return typeof match?.[1] === "number" ? match[1] : 0;
}

export function scoreContest(input: ScoringInput): ScoringResult {
  const { entries, events, totalPoolUsdc, rakeBps } = input;

  const eventMap = new Map(events.map((e) => [e.eventId, e]));
  const voidedEventCount = events.filter((e) => e.voided).length;

  // Score each entry
  const scored: ScoredEntryResult[] = entries.map((entry) => {
    let score = 0;
    let correctCount = 0;

    const picks: ScoredPickResult[] = entry.picks.map((pick) => {
      const event = eventMap.get(pick.eventId);

      if (!event || event.voided) {
        return {
          eventId: pick.eventId,
          pickedOutcome: pick.pickedOutcome,
          resolvedOutcome: null,
          correct: false,
          probability: 0,
          pointsEarned: 0,
          voided: true,
        };
      }

      // Use entry-time odds from the entry's snapshot
      const probability = getProbability(
        entry.oddsSnapshot,
        pick.eventId,
        pick.pickedOutcome
      );
      const correct = pick.pickedOutcome === event.resolvedOutcome;
      const points = correct ? 1 / clampProbability(probability) : 0;

      if (correct) {
        score += points;
        correctCount++;
      }

      return {
        eventId: pick.eventId,
        pickedOutcome: pick.pickedOutcome,
        resolvedOutcome: event.resolvedOutcome,
        correct,
        probability,
        pointsEarned: Math.round(points * 1e6) / 1e6,
        voided: false,
      };
    });

    return {
      entryId: entry.entryId,
      walletAddress: entry.walletAddress,
      score: Math.round(score * 1e6) / 1e6,
      correctCount,
      rank: 0,
      payoutUsdc: 0,
      picks,
    };
  });

  // Pool calculations
  const rakeAmount = Math.round(totalPoolUsdc * (rakeBps / 10000) * 100) / 100;
  const prizePool = Math.round((totalPoolUsdc - rakeAmount) * 100) / 100;

  // Sort by score desc, then by earliest enteredAt (tiebreaker)
  const entryTimeMap = new Map(
    entries.map((e) => [e.entryId, e.enteredAt.getTime()])
  );

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (entryTimeMap.get(a.entryId) ?? 0) - (entryTimeMap.get(b.entryId) ?? 0);
  });

  // Assign ranks
  for (let i = 0; i < scored.length; i++) {
    if (i > 0 && scored[i].score === scored[i - 1].score) {
      scored[i].rank = scored[i - 1].rank;
    } else {
      scored[i].rank = i + 1;
    }
  }

  // Determine winners (rank 1 entries)
  const winners = scored.filter((e) => e.rank === 1 && e.score > 0);

  if (winners.length > 0) {
    const share = Math.round((prizePool / winners.length) * 100) / 100;
    for (const winner of winners) {
      winner.payoutUsdc = share;
    }
  }

  return {
    scoredEntries: scored,
    totalPool: totalPoolUsdc,
    rakeAmount,
    prizePool,
    voidedEventCount,
  };
}
