"use client";

import type { ContestEvent } from "@polypool/shared";
import { usePicksStore } from "@/stores/picks-store";

interface EventPickerProps {
  event: ContestEvent;
  locked: boolean;
  odds?: Record<string, number>; // { "Yes": 0.65, "No": 0.35 }
}

export function EventPicker({ event, locked, odds }: EventPickerProps) {
  const picks = usePicksStore((s) => s.picks);
  const setPick = usePicksStore((s) => s.setPick);
  const selected = picks[event.id] ?? null;

  const isResolved = event.status === "resolved";
  const resolvedOutcome = event.resolvedOutcome;

  return (
    <div className="border border-neutral-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-black">{event.eventTitle}</h4>
        {isResolved && resolvedOutcome && (
          <span className="shrink-0 border border-win/30 bg-win/5 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-win">
            {resolvedOutcome}
          </span>
        )}
        {event.status === "voided" && (
          <span className="shrink-0 border border-loss/30 bg-loss/5 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-loss">
            Voided
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {event.outcomes.map((outcome) => {
          const isSelected = selected === outcome.label;
          const isCorrect = isResolved && resolvedOutcome === outcome.label;
          const isWrong =
            isResolved && isSelected && resolvedOutcome !== outcome.label;
          const isRight =
            isResolved && isSelected && resolvedOutcome === outcome.label;
          const disabled = locked || isResolved || event.status === "voided";

          const prob = odds?.[outcome.label];
          const multiplier = prob && prob > 0 ? 1 / prob : null;

          let style =
            "flex-1 min-w-[80px] border py-3 px-3 text-center transition-all ";

          if (isRight) {
            style += "border-win bg-win/10 text-win ";
          } else if (isWrong) {
            style += "border-loss/50 bg-loss/10 text-loss line-through ";
          } else if (isSelected) {
            style += "border-black bg-black text-white font-bold ";
          } else if (isCorrect && !isSelected) {
            style += "border-win/20 bg-win/5 text-neutral-400 ";
          } else if (disabled) {
            style += "border-neutral-200 bg-neutral-50 text-neutral-300 cursor-not-allowed ";
          } else {
            style +=
              "border-neutral-300 bg-white text-neutral-500 hover:border-black hover:text-black cursor-pointer ";
          }

          return (
            <button
              key={outcome.label}
              className={style}
              disabled={disabled}
              onClick={() => {
                if (!disabled) setPick(event.id, outcome.label);
              }}
            >
              <span className="block text-xs font-bold uppercase tracking-wide">
                {outcome.label}
              </span>
              {prob != null && (
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span className={`font-mono text-[11px] ${isSelected ? "text-white/70" : "text-neutral-400"}`}>
                    {(prob * 100).toFixed(0)}%
                  </span>
                  <span className={`font-mono text-[11px] font-bold ${isSelected ? "text-white" : "text-win"}`}>
                    {multiplier ? `×${multiplier.toFixed(2)}` : ""}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
