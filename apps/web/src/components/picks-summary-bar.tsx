"use client";

import { usePicksStore } from "@/stores/picks-store";
import type { ContestEvent } from "@polypool/shared";

interface PicksSummaryBarProps {
  events: ContestEvent[];
  entryFeeUsdc: number;
  onSubmit: () => void;
  submitting: boolean;
  odds?: Record<string, Record<string, number>>; // eventId -> { "Yes": 0.65, "No": 0.35 }
}

export function PicksSummaryBar({
  events,
  entryFeeUsdc,
  onSubmit,
  submitting,
  odds,
}: PicksSummaryBarProps) {
  const picks = usePicksStore((s) => s.picks);
  const pickedCount = Object.keys(picks).length;
  const totalEvents = events.length;
  const allPicked = pickedCount >= totalEvents;

  // Calculate cumulative multiplier from selected picks
  let cumulativeMultiplier: number | null = null;
  if (odds && pickedCount > 0) {
    let total = 0;
    let hasOdds = false;
    for (const [eventId, pickedOutcome] of Object.entries(picks)) {
      const eventOdds = odds[eventId];
      const prob = eventOdds?.[pickedOutcome];
      if (prob && prob > 0) {
        total += 1 / prob;
        hasOdds = true;
      }
    }
    if (hasOdds) cumulativeMultiplier = total;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-bold text-black">
              {pickedCount}/{totalEvents}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-neutral-400">
              picked
            </span>
          </div>
          {cumulativeMultiplier != null && (
            <div className="flex items-baseline gap-1.5 border-l border-neutral-200 pl-4">
              <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                Score
              </span>
              <span className="font-mono text-sm font-bold text-win">
                {cumulativeMultiplier.toFixed(2)}pts
              </span>
            </div>
          )}
        </div>
        <button
          onClick={onSubmit}
          disabled={!allPicked || submitting}
          className={`border px-6 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
            allPicked && !submitting
              ? "border-black bg-black text-white hover:bg-white hover:text-black"
              : "border-neutral-200 text-neutral-300 cursor-not-allowed"
          }`}
        >
          {submitting
            ? "Submitting…"
            : allPicked
              ? `Review — $${entryFeeUsdc} USDC`
              : `Pick all ${totalEvents}`}
        </button>
      </div>
    </div>
  );
}
