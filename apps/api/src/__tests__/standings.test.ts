import { describe, expect, it } from "vitest";
import { rankStandings } from "../services/standings";

describe("rankStandings", () => {
  it("assigns equal ranks for equal scores", () => {
    const rows = rankStandings([
      {
        walletAddress: "w1",
        score: "10.5",
        correctCount: 3,
        payoutUsdc: "100.00",
      },
      {
        walletAddress: "w2",
        score: "10.5",
        correctCount: 3,
        payoutUsdc: "100.00",
      },
      {
        walletAddress: "w3",
        score: "8.25",
        correctCount: 2,
        payoutUsdc: null,
      },
    ]);

    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("normalizes null values to safe defaults", () => {
    const rows = rankStandings([
      {
        walletAddress: "w1",
        score: null,
        correctCount: null,
        payoutUsdc: null,
      },
    ]);

    expect(rows[0]).toEqual({
      walletAddress: "w1",
      score: 0,
      correctCount: 0,
      rank: 1,
      payoutUsdc: null,
    });
  });
});
