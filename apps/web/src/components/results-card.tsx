"use client";

interface ResultsCardProps {
  score: number;
  correctCount: number;
  totalEvents: number;
  rank: number;
  totalEntrants: number;
  payoutUsdc: number;
  payoutTxSignature: string | null;
}

export function ResultsCard({
  score,
  correctCount,
  totalEvents,
  rank,
  totalEntrants,
  payoutUsdc,
  payoutTxSignature,
}: ResultsCardProps) {
  const hasPayout = payoutUsdc > 0;

  return (
    <div
      className={`border p-6 ${
        hasPayout ? "border-win/30 bg-win/[0.03]" : "border-neutral-200"
      }`}
    >
      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
        Your Results
      </h3>

      <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-400">
            Score
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-black">
            {score.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-400">
            Correct
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-black">
            {correctCount}
            <span className="text-base font-normal text-neutral-300">
              /{totalEvents}
            </span>
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-400">
            Rank
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-black">
            #{rank}
            <span className="text-base font-normal text-neutral-300">
              /{totalEntrants}
            </span>
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-400">
            Payout
          </p>
          <p
            className={`mt-1 font-mono text-2xl font-bold ${
              hasPayout ? "text-win" : "text-neutral-200"
            }`}
          >
            ${payoutUsdc.toFixed(2)}
          </p>
          {payoutTxSignature && (
            <a
              href={`https://solscan.io/tx/${payoutTxSignature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-win underline"
            >
              View tx →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
