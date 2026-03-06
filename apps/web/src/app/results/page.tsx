"use client";

import { useContests } from "@/hooks/use-contests";
import { ContestCard } from "@/components/contest-card";

export default function ResultsPage() {
  const { data: contests, isLoading } = useContests();

  const resolved = contests
    ?.filter((c) => c.status === "resolved" || c.status === "voided")
    ?? [];

  return (
    <>
      <h1 className="text-xl font-extrabold uppercase tracking-tight text-black sm:text-2xl">
        Results
      </h1>
      <p className="mt-2 font-mono text-sm text-neutral-400">
        Past contests and final standings.
      </p>

      {isLoading && (
        <div className="mt-8 grid gap-px border border-neutral-200 bg-neutral-200 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse bg-neutral-100" />
          ))}
        </div>
      )}

      {!isLoading && resolved.length === 0 && (
        <div className="mt-8 border border-neutral-200 p-8 text-center">
          <p className="font-mono text-sm text-neutral-400">
            No completed contests yet.
          </p>
        </div>
      )}

      {resolved.length > 0 && (
        <div className="mt-8 grid gap-px border border-neutral-200 bg-neutral-200 sm:grid-cols-2 lg:grid-cols-3">
          {resolved.map((contest, i) => (
            <div
              key={contest.id}
              className="animate-fade-up bg-white"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <ContestCard contest={contest} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
