"use client";

import { useState, useEffect, useCallback } from "react";
import type { ContestListItem, ContestStatus } from "@polypool/shared";
import { adminApi } from "@/lib/admin-api";

const STATUS_STYLES: Record<
  string,
  { style: string; label: string }
> = {
  draft: { style: "border-neutral-300 text-neutral-400", label: "Draft" },
  active: { style: "border-win/40 bg-win/5 text-win", label: "Active" },
  closed: { style: "border-neutral-400 text-neutral-500", label: "Closed" },
  resolved: { style: "border-win/30 text-win", label: "Resolved" },
  voided: { style: "border-loss/30 text-loss", label: "Voided" },
  cancelled: { style: "border-loss/30 text-loss", label: "Cancelled" },
};

const VALID_TRANSITIONS: Record<string, ContestStatus[]> = {
  draft: ["active", "voided"],
  active: ["closed", "voided"],
  closed: ["voided"],
  resolved: [],
  voided: [],
  cancelled: [],
};

export function ContestManager() {
  const [contests, setContests] = useState<ContestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const fetchContests = useCallback(async () => {
    try {
      const data = await adminApi.getContests();
      setContests(data);
      setError("");
    } catch (err) {
      setError("Failed to load contests");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContests();
  }, [fetchContests]);

  const handleTransition = async (
    contestId: string,
    newStatus: ContestStatus
  ) => {
    const isDestructive = newStatus === "voided";
    if (isDestructive && !window.confirm(`Are you sure you want to ${newStatus} this contest?`)) {
      return;
    }

    setTransitioning(contestId);
    try {
      await adminApi.transitionContest(contestId, newStatus);
      await fetchContests();
    } catch (err) {
      console.error(err);
      alert(
        `Transition failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setTransitioning(null);
    }
  };

  const formatClosesAt = (closesAt: string | null) => {
    if (!closesAt) return "No close time";
    const d = new Date(closesAt);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    if (diff < 0) return "Past";
    const hours = Math.floor(diff / 3_600_000);
    const mins = Math.floor((diff % 3_600_000) / 60_000);
    if (hours > 24) return d.toLocaleDateString();
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse border border-neutral-200 bg-neutral-100"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-loss/30 bg-loss/5 p-4 font-mono text-sm text-loss">
        {error}
      </div>
    );
  }

  if (contests.length === 0) {
    return (
      <div className="py-8 text-center font-mono text-sm text-neutral-300">
        No contests yet. Create one in the Create tab.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {contests.map((contest) => {
        const status = STATUS_STYLES[contest.status] || STATUS_STYLES.draft;
        const transitions = VALID_TRANSITIONS[contest.status] || [];
        const isExpanded = expandedId === contest.id;

        return (
          <div
            key={contest.id}
            className="border border-neutral-200"
          >
            {/* Row header */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : contest.id)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-black">
                  {contest.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-neutral-400">
                  <span>{contest.eventCount} markets</span>
                  <span>·</span>
                  <span>{contest.totalEntries} entries</span>
                  <span>·</span>
                  <span>${contest.totalPoolUsdc} pool</span>
                  <span>·</span>
                  <span>Closes: {formatClosesAt(contest.closesAt)}</span>
                </div>
              </div>
              <span
                className={`inline-flex shrink-0 items-center border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${status.style}`}
              >
                {status.label}
              </span>
              <span className="shrink-0 font-mono text-neutral-400">
                {isExpanded ? "−" : "+"}
              </span>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
                <div className="flex flex-wrap gap-2">
                  {transitions.map((s) => {
                    const isDestructive = s === "voided";
                    return (
                      <button
                        key={s}
                        onClick={() => handleTransition(contest.id, s)}
                        disabled={transitioning === contest.id}
                        className={`border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 ${
                          isDestructive
                            ? "border-loss/30 text-loss hover:bg-loss/10"
                            : "border-black bg-black text-white hover:bg-white hover:text-black"
                        }`}
                      >
                        {transitioning === contest.id
                          ? "..."
                          : `${s.charAt(0).toUpperCase() + s.slice(1)}`}
                      </button>
                    );
                  })}
                  {transitions.length === 0 && (
                    <span className="font-mono text-[10px] text-neutral-300">
                      No transitions available
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <a
                    href={`/contests/${contest.id}`}
                    className="font-mono text-xs text-neutral-500 underline hover:text-black"
                  >
                    View contest →
                  </a>
                </div>
                <p className="mt-2 font-mono text-[10px] text-neutral-300">
                  ID: {contest.id}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
