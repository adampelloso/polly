import { describe, it, expect } from "vitest";
import {
  scoreContest,
  type ScoringInput,
  type EntryInput,
  type EventInput,
} from "../services/scoring-engine";

function makeEvents(overrides?: Partial<EventInput>[]): EventInput[] {
  const defaults: EventInput[] = [
    { eventId: "e1", resolvedOutcome: "Yes", voided: false },
    { eventId: "e2", resolvedOutcome: "No", voided: false },
    { eventId: "e3", resolvedOutcome: "Yes", voided: false },
  ];
  if (overrides) {
    return defaults.map((d, i) => ({ ...d, ...overrides[i] }));
  }
  return defaults;
}

function makeEntry(partial: Partial<EntryInput> & { entryId: string }): EntryInput {
  return {
    walletAddress: `wallet-${partial.entryId}`,
    enteredAt: new Date("2026-03-04T12:00:00Z"),
    picks: [
      { eventId: "e1", pickedOutcome: "Yes" },
      { eventId: "e2", pickedOutcome: "No" },
      { eventId: "e3", pickedOutcome: "Yes" },
    ],
    oddsSnapshot: {
      "e1:Yes": 0.7,
      "e2:No": 0.3,
      "e3:Yes": 0.5,
    },
    ...partial,
  };
}

function makeInput(overrides?: Partial<ScoringInput>): ScoringInput {
  return {
    entries: [],
    events: makeEvents(),
    totalPoolUsdc: 500,
    rakeBps: 1000, // 10%
    ...overrides,
  };
}

describe("scoring-engine", () => {
  describe("basic scoring", () => {
    it("scores correct picks using 1/P formula with entry-time odds", () => {
      const input = makeInput({
        entries: [
          makeEntry({
            entryId: "entry1",
            oddsSnapshot: {
              "e1:Yes": 0.7,
              "e2:No": 0.3,
              "e3:Yes": 0.5,
            },
          }),
        ],
      });

      const result = scoreContest(input);
      const entry = result.scoredEntries[0];

      expect(entry.correctCount).toBe(3);
      // 1/0.7 + 1/0.3 + 1/0.5 = 1.4286 + 3.3333 + 2.0 = 6.7619
      expect(entry.score).toBeCloseTo(6.7619, 2);
    });

    it("assigns zero points for wrong picks", () => {
      const input = makeInput({
        entries: [
          makeEntry({
            entryId: "entry1",
            picks: [
              { eventId: "e1", pickedOutcome: "No" },  // wrong
              { eventId: "e2", pickedOutcome: "Yes" },  // wrong
              { eventId: "e3", pickedOutcome: "No" },   // wrong
            ],
            oddsSnapshot: {
              "e1:No": 0.3,
              "e2:Yes": 0.7,
              "e3:No": 0.5,
            },
          }),
        ],
      });

      const result = scoreContest(input);
      expect(result.scoredEntries[0].score).toBe(0);
      expect(result.scoredEntries[0].correctCount).toBe(0);
    });

    it("uses different odds per entry (entry-time snapshot)", () => {
      const input = makeInput({
        entries: [
          makeEntry({
            entryId: "early",
            enteredAt: new Date("2026-03-04T10:00:00Z"),
            picks: [{ eventId: "e1", pickedOutcome: "Yes" }],
            oddsSnapshot: { "e1:Yes": 0.3 }, // early = low odds = high multiplier
          }),
          makeEntry({
            entryId: "late",
            enteredAt: new Date("2026-03-04T14:00:00Z"),
            picks: [{ eventId: "e1", pickedOutcome: "Yes" }],
            oddsSnapshot: { "e1:Yes": 0.8 }, // late = high odds = low multiplier
          }),
        ],
        events: [{ eventId: "e1", resolvedOutcome: "Yes", voided: false }],
      });

      const result = scoreContest(input);
      const early = result.scoredEntries.find((e) => e.entryId === "early")!;
      const late = result.scoredEntries.find((e) => e.entryId === "late")!;

      // 1/0.3 = 3.333 vs 1/0.8 = 1.25
      expect(early.score).toBeGreaterThan(late.score);
      expect(early.score).toBeCloseTo(3.3333, 2);
      expect(late.score).toBeCloseTo(1.25, 2);
    });

    it("supports non-Yes/No outcome labels from snapshots", () => {
      const input = makeInput({
        events: [{ eventId: "e1", resolvedOutcome: "Over", voided: false }],
        entries: [
          makeEntry({
            entryId: "entry1",
            picks: [{ eventId: "e1", pickedOutcome: "Over" }],
            oddsSnapshot: { "e1:Over": 0.4 },
          }),
        ],
      });

      const result = scoreContest(input);
      expect(result.scoredEntries[0].score).toBeCloseTo(2.5, 2);
      expect(result.scoredEntries[0].correctCount).toBe(1);
    });

    it("matches outcomes case-insensitively when reading snapshot keys", () => {
      const input = makeInput({
        events: [{ eventId: "e1", resolvedOutcome: "YES", voided: false }],
        entries: [
          makeEntry({
            entryId: "entry1",
            picks: [{ eventId: "e1", pickedOutcome: "YES" }],
            oddsSnapshot: { "e1:Yes": 0.5 },
          }),
        ],
      });

      const result = scoreContest(input);
      expect(result.scoredEntries[0].score).toBeCloseTo(2, 2);
      expect(result.scoredEntries[0].correctCount).toBe(1);
    });
  });

  describe("voided market handling", () => {
    it("excludes voided events from scoring", () => {
      const input = makeInput({
        events: [
          { eventId: "e1", resolvedOutcome: "Yes", voided: false },
          { eventId: "e2", resolvedOutcome: null, voided: true },
          { eventId: "e3", resolvedOutcome: "Yes", voided: false },
        ],
        entries: [
          makeEntry({
            entryId: "entry1",
            oddsSnapshot: { "e1:Yes": 0.5, "e2:No": 0.3, "e3:Yes": 0.5 },
          }),
        ],
      });

      const result = scoreContest(input);
      expect(result.voidedEventCount).toBe(1);

      const entry = result.scoredEntries[0];
      // Only e1 and e3 count: 1/0.5 + 1/0.5 = 4.0
      expect(entry.score).toBeCloseTo(4.0, 2);
      expect(entry.correctCount).toBe(2);

      const voidedPick = entry.picks.find((p) => p.eventId === "e2")!;
      expect(voidedPick.voided).toBe(true);
      expect(voidedPick.pointsEarned).toBe(0);
    });

    it("handles all events voided — everyone scores 0, no payouts", () => {
      const input = makeInput({
        events: [
          { eventId: "e1", resolvedOutcome: null, voided: true },
          { eventId: "e2", resolvedOutcome: null, voided: true },
          { eventId: "e3", resolvedOutcome: null, voided: true },
        ],
        entries: [makeEntry({ entryId: "entry1" })],
      });

      const result = scoreContest(input);
      expect(result.scoredEntries[0].score).toBe(0);
      expect(result.scoredEntries[0].payoutUsdc).toBe(0);
    });
  });

  describe("tiebreaker by entry time", () => {
    it("breaks ties by earliest enteredAt", () => {
      const input = makeInput({
        events: [{ eventId: "e1", resolvedOutcome: "Yes", voided: false }],
        entries: [
          makeEntry({
            entryId: "late",
            walletAddress: "w-late",
            enteredAt: new Date("2026-03-04T14:00:00Z"),
            picks: [{ eventId: "e1", pickedOutcome: "Yes" }],
            oddsSnapshot: { "e1:Yes": 0.5 },
          }),
          makeEntry({
            entryId: "early",
            walletAddress: "w-early",
            enteredAt: new Date("2026-03-04T10:00:00Z"),
            picks: [{ eventId: "e1", pickedOutcome: "Yes" }],
            oddsSnapshot: { "e1:Yes": 0.5 },
          }),
        ],
      });

      const result = scoreContest(input);
      // Same score, but early entry comes first and wins
      expect(result.scoredEntries[0].entryId).toBe("early");
      expect(result.scoredEntries[0].rank).toBe(1);
      expect(result.scoredEntries[1].entryId).toBe("late");
      // Same rank since score is equal
      expect(result.scoredEntries[1].rank).toBe(1);
      // Split evenly since tied rank
      expect(result.scoredEntries[0].payoutUsdc).toBe(result.scoredEntries[1].payoutUsdc);
    });
  });

  describe("rake calculation", () => {
    it("calculates rake from totalPool using basis points", () => {
      const input = makeInput({
        totalPoolUsdc: 1000,
        rakeBps: 1500, // 15%
        entries: [],
      });

      const result = scoreContest(input);
      expect(result.rakeAmount).toBe(150);
      expect(result.prizePool).toBe(850);
      expect(result.totalPool).toBe(1000);
    });

    it("handles zero rake", () => {
      const input = makeInput({
        totalPoolUsdc: 500,
        rakeBps: 0,
        entries: [],
      });

      const result = scoreContest(input);
      expect(result.rakeAmount).toBe(0);
      expect(result.prizePool).toBe(500);
    });
  });

  describe("winner-take-all payout", () => {
    it("gives entire prize pool to single winner", () => {
      const input = makeInput({
        totalPoolUsdc: 500,
        rakeBps: 1000,
        events: [{ eventId: "e1", resolvedOutcome: "Yes", voided: false }],
        entries: [
          makeEntry({
            entryId: "winner",
            picks: [{ eventId: "e1", pickedOutcome: "Yes" }],
            oddsSnapshot: { "e1:Yes": 0.5 },
          }),
          makeEntry({
            entryId: "loser",
            picks: [{ eventId: "e1", pickedOutcome: "No" }],
            oddsSnapshot: { "e1:No": 0.5 },
          }),
        ],
      });

      const result = scoreContest(input);
      const winner = result.scoredEntries.find((e) => e.entryId === "winner")!;
      const loser = result.scoredEntries.find((e) => e.entryId === "loser")!;

      expect(winner.payoutUsdc).toBe(450); // 500 - 50 rake
      expect(loser.payoutUsdc).toBe(0);
    });

    it("splits evenly when multiple entries tie for first", () => {
      const input = makeInput({
        totalPoolUsdc: 600,
        rakeBps: 1000, // rake = 60, prize = 540
        events: [{ eventId: "e1", resolvedOutcome: "Yes", voided: false }],
        entries: [
          makeEntry({
            entryId: "a",
            enteredAt: new Date("2026-03-04T10:00:00Z"),
            picks: [{ eventId: "e1", pickedOutcome: "Yes" }],
            oddsSnapshot: { "e1:Yes": 0.5 },
          }),
          makeEntry({
            entryId: "b",
            enteredAt: new Date("2026-03-04T11:00:00Z"),
            picks: [{ eventId: "e1", pickedOutcome: "Yes" }],
            oddsSnapshot: { "e1:Yes": 0.5 },
          }),
          makeEntry({
            entryId: "c",
            enteredAt: new Date("2026-03-04T12:00:00Z"),
            picks: [{ eventId: "e1", pickedOutcome: "Yes" }],
            oddsSnapshot: { "e1:Yes": 0.5 },
          }),
        ],
      });

      const result = scoreContest(input);
      // All three tied, split 540/3 = 180
      for (const entry of result.scoredEntries) {
        expect(entry.payoutUsdc).toBe(180);
        expect(entry.rank).toBe(1);
      }
    });
  });

  describe("edge cases", () => {
    it("clamps probability at 0.02 floor (max 50 points)", () => {
      const input = makeInput({
        events: [{ eventId: "e1", resolvedOutcome: "Yes", voided: false }],
        entries: [
          makeEntry({
            entryId: "entry1",
            picks: [{ eventId: "e1", pickedOutcome: "Yes" }],
            oddsSnapshot: { "e1:Yes": 0.01 },
          }),
        ],
      });

      const result = scoreContest(input);
      // Clamped to 0.02 → 1/0.02 = 50
      expect(result.scoredEntries[0].picks[0].pointsEarned).toBe(50);
    });

    it("clamps probability at 0.98 ceiling", () => {
      const input = makeInput({
        events: [{ eventId: "e1", resolvedOutcome: "Yes", voided: false }],
        entries: [
          makeEntry({
            entryId: "entry1",
            picks: [{ eventId: "e1", pickedOutcome: "Yes" }],
            oddsSnapshot: { "e1:Yes": 0.99 },
          }),
        ],
      });

      const result = scoreContest(input);
      // Clamped to 0.98 → 1/0.98 ≈ 1.0204
      expect(result.scoredEntries[0].picks[0].pointsEarned).toBeCloseTo(1.0204, 3);
    });

    it("all wrong picks — no payout", () => {
      const input = makeInput({
        events: [{ eventId: "e1", resolvedOutcome: "Yes", voided: false }],
        entries: [
          makeEntry({
            entryId: "entry1",
            picks: [{ eventId: "e1", pickedOutcome: "No" }],
            oddsSnapshot: { "e1:No": 0.5 },
          }),
        ],
      });

      const result = scoreContest(input);
      expect(result.scoredEntries[0].score).toBe(0);
      expect(result.scoredEntries[0].payoutUsdc).toBe(0);
    });

    it("single entry wins everything", () => {
      const input = makeInput({
        totalPoolUsdc: 100,
        rakeBps: 1000,
        events: [{ eventId: "e1", resolvedOutcome: "Yes", voided: false }],
        entries: [
          makeEntry({
            entryId: "solo",
            picks: [{ eventId: "e1", pickedOutcome: "Yes" }],
            oddsSnapshot: { "e1:Yes": 0.5 },
          }),
        ],
      });

      const result = scoreContest(input);
      expect(result.scoredEntries[0].payoutUsdc).toBe(90);
    });

    it("no entries — empty result", () => {
      const input = makeInput({ entries: [] });
      const result = scoreContest(input);
      expect(result.scoredEntries).toHaveLength(0);
      expect(result.prizePool).toBe(450);
    });
  });
});
