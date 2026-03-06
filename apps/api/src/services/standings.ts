export interface StandingsRowInput {
  walletAddress: string;
  score: string | null;
  correctCount: number | null;
  payoutUsdc: string | null;
}

export interface StandingsRowOutput {
  walletAddress: string;
  score: number;
  correctCount: number;
  rank: number;
  payoutUsdc: number | null;
}

export function rankStandings(rows: StandingsRowInput[]): StandingsRowOutput[] {
  let previousScore: number | null = null;
  let previousRank = 0;

  return rows.map((row, i) => {
    const score = row.score ? parseFloat(row.score) : 0;
    const rank = previousScore !== null && score === previousScore ? previousRank : i + 1;
    previousScore = score;
    previousRank = rank;

    return {
      walletAddress: row.walletAddress,
      score,
      correctCount: row.correctCount ?? 0,
      rank,
      payoutUsdc: row.payoutUsdc ? parseFloat(row.payoutUsdc) : null,
    };
  });
}
