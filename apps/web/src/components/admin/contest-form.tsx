"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CreateContestEventInput,
  ContestCategory,
  ContestDetail,
} from "@polypool/shared";
import { adminApi } from "@/lib/admin-api";

interface ContestFormProps {
  legs: CreateContestEventInput[];
  onRemoveLeg: (conditionId: string) => void;
  onMoveLeg: (index: number, direction: "up" | "down") => void;
  onCreated: (contest: ContestDetail) => void;
}

const CATEGORIES: { value: ContestCategory; label: string }[] = [
  { value: "sports", label: "Sports" },
  { value: "politics", label: "Politics" },
  { value: "crypto", label: "Crypto" },
  { value: "culture", label: "Culture" },
  { value: "mixed", label: "Mixed" },
];

const FEE_PRESETS = [1, 5, 10, 25];

function defaultClosesAt(): string {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function toDatetimeLocalValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ContestForm({
  legs,
  onRemoveLeg,
  onMoveLeg,
  onCreated,
}: ContestFormProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ContestCategory>("mixed");
  const [entryFee, setEntryFee] = useState(5);
  const [customFee, setCustomFee] = useState("");
  const [closesAt, setClosesAt] = useState(defaultClosesAt);
  const [closeEditedManually, setCloseEditedManually] = useState(false);
  const [minEntries, setMinEntries] = useState(1);
  const [maxEntries, setMaxEntries] = useState("");
  const [rakeBps, setRakeBps] = useState(1000); // 10%
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const effectiveFee = customFee ? Number(customFee) : entryFee;
  const suggestedClosesAt = useMemo(() => {
    const endDates = legs
      .map((leg) => leg.marketEndDate)
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .map((v) => new Date(v))
      .filter((d) => !Number.isNaN(d.getTime()));

    if (endDates.length === 0) return null;
    const earliest = new Date(Math.min(...endDates.map((d) => d.getTime())));
    const suggested = new Date(earliest.getTime() - 10 * 60 * 1000);
    return toDatetimeLocalValue(suggested);
  }, [legs]);

  useEffect(() => {
    if (!suggestedClosesAt) return;
    if (closeEditedManually) return;
    setClosesAt(suggestedClosesAt);
  }, [suggestedClosesAt, closeEditedManually]);

  const handleCreate = async (openImmediately: boolean) => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (legs.length === 0) {
      setError("Add at least one market");
      return;
    }
    if (!effectiveFee || effectiveFee <= 0) {
      setError("Entry fee must be positive");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const contest = await adminApi.createContest({
        title: title.trim(),
        description: "",
        category,
        entryFeeUsdc: effectiveFee,
        rakeBps,
        minEntries,
        maxEntries: maxEntries ? Number(maxEntries) : null,
        closesAt: new Date(closesAt).toISOString(),
        events: legs.map((leg, i) => ({ ...leg, sortOrder: i })),
      });

      if (openImmediately) {
        const opened = await adminApi.transitionContest(contest.id, "active");
        onCreated(opened);
      } else {
        onCreated(contest);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create contest");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Selected Legs */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
          Selected Markets ({legs.length})
        </label>
        {legs.length === 0 ? (
          <p className="mt-2 font-mono text-sm text-neutral-300">
            Search and add markets above to build your contest slate.
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            {legs.map((leg, i) => (
              <div
                key={leg.polymarketConditionId}
                className="flex items-center gap-2 border border-neutral-200 p-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-neutral-300 font-mono text-xs font-bold text-neutral-400">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-black">{leg.eventTitle}</p>
                  <p className="font-mono text-[10px] text-neutral-400">
                    {leg.outcomes.map((o) => o.label).join(" / ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => onMoveLeg(i, "up")}
                    disabled={i === 0}
                    className="px-1.5 py-0.5 font-mono text-[10px] text-neutral-400 hover:text-black disabled:opacity-30"
                  >
                    up
                  </button>
                  <button
                    onClick={() => onMoveLeg(i, "down")}
                    disabled={i === legs.length - 1}
                    className="px-1.5 py-0.5 font-mono text-[10px] text-neutral-400 hover:text-black disabled:opacity-30"
                  >
                    dn
                  </button>
                  <button
                    onClick={() => onRemoveLeg(leg.polymarketConditionId)}
                    className="px-1.5 py-0.5 font-mono text-[10px] text-loss hover:text-loss/80"
                  >
                    x
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Title */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Daily Picks -- March 4"
          className="mt-1 w-full border border-neutral-300 bg-white px-4 py-2.5 font-mono text-sm text-black placeholder-neutral-400 outline-none focus:border-black"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
          Category
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`border px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                category === c.value
                  ? "border-black bg-black text-white"
                  : "border-neutral-300 text-neutral-400 hover:border-black hover:text-black"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Entry Fee */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
          Entry Fee (USDC)
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {FEE_PRESETS.map((fee) => (
            <button
              key={fee}
              onClick={() => {
                setEntryFee(fee);
                setCustomFee("");
              }}
              className={`border px-4 py-2 font-mono text-sm font-bold transition-colors ${
                entryFee === fee && !customFee
                  ? "border-black bg-black text-white"
                  : "border-neutral-300 text-neutral-500 hover:border-black hover:text-black"
              }`}
            >
              ${fee}
            </button>
          ))}
          <input
            type="number"
            value={customFee}
            onChange={(e) => setCustomFee(e.target.value)}
            placeholder="Custom"
            min={0.01}
            step={0.01}
            className="w-24 border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-black placeholder-neutral-400 outline-none focus:border-black"
          />
        </div>
      </div>

      {/* Closes At */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
          Entry Window Closes
        </label>
        {suggestedClosesAt && (
          <div className="mt-1 flex items-center justify-between gap-3 border border-neutral-200 px-3 py-2">
            <span className="font-mono text-[11px] text-neutral-500">
              Suggested: {new Date(suggestedClosesAt).toLocaleString()}
            </span>
            <button
              type="button"
              onClick={() => {
                setClosesAt(suggestedClosesAt);
                setCloseEditedManually(false);
              }}
              className="border border-neutral-300 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
            >
              Use Suggested
            </button>
          </div>
        )}
        <input
          type="datetime-local"
          value={closesAt}
          onChange={(e) => {
            setClosesAt(e.target.value);
            setCloseEditedManually(true);
          }}
          className="mt-1 w-full border border-neutral-300 bg-white px-4 py-2.5 font-mono text-sm text-black outline-none focus:border-black [color-scheme:light]"
        />
      </div>

      {/* Entries + Rake */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Min Entries
          </label>
          <input
            type="number"
            value={minEntries}
            onChange={(e) => setMinEntries(Number(e.target.value))}
            min={1}
            className="mt-1 w-full border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-black outline-none focus:border-black"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Max Entries
          </label>
          <input
            type="number"
            value={maxEntries}
            onChange={(e) => setMaxEntries(e.target.value)}
            placeholder="∞"
            min={1}
            className="mt-1 w-full border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-black placeholder-neutral-400 outline-none focus:border-black"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Rake (bps)
          </label>
          <input
            type="number"
            value={rakeBps}
            onChange={(e) => setRakeBps(Number(e.target.value))}
            min={0}
            max={5000}
            className="mt-1 w-full border border-neutral-300 bg-white px-3 py-2 font-mono text-sm text-black outline-none focus:border-black"
          />
          <p className="mt-0.5 font-mono text-[10px] text-neutral-300">
            {(rakeBps / 100).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-loss/30 bg-loss/5 p-3 font-mono text-sm text-loss">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => handleCreate(false)}
          disabled={submitting}
          className="border border-neutral-300 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-neutral-500 transition-colors hover:border-black hover:text-black disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create as Draft"}
        </button>
        <button
          onClick={() => handleCreate(true)}
          disabled={submitting}
          className="border border-black bg-black px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create & Go Live"}
        </button>
      </div>
    </div>
  );
}
