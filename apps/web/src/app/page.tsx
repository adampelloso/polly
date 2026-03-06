"use client";

import Link from "next/link";
import { useContests } from "@/hooks/use-contests";
import { Countdown } from "@/components/countdown";

export default function HomePage() {
  const { data: contests, isLoading, error } = useContests();

  const activeContest = contests?.find((c) => c.status === "active");

  return (
    <>
      {/* ── Active Contest Hero ── */}
      {activeContest && (
        <Link
          href={`/contests/${activeContest.id}`}
          className="group block animate-fade-up border border-neutral-200 p-6 transition-colors hover:border-black sm:p-8"
        >
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="border border-win/40 bg-win/5 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-win">
              ● Live
            </span>
            <span className="border border-neutral-300 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neutral-400">
              {activeContest.category}
            </span>
            <span className="border border-neutral-300 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neutral-400">
              Winner Take All
            </span>
          </div>

          <h2 className="mt-4 text-2xl font-extrabold uppercase tracking-tight text-black transition-colors group-hover:text-neutral-700 sm:text-3xl">
            {activeContest.title}
          </h2>

          {activeContest.closesAt && (
            <div className="mt-3">
              <Countdown
                targetDate={new Date(activeContest.closesAt)}
                prefix="Closes in"
              />
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-px border border-neutral-200 bg-neutral-200 sm:grid-cols-4">
            <div className="bg-white p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                Entry Fee
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-black">
                ${activeContest.entryFeeUsdc}
              </p>
            </div>
            <div className="bg-white p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                Prize Pool
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-win">
                ${Number(activeContest.totalPoolUsdc).toFixed(2)}
              </p>
            </div>
            <div className="bg-white p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                Entries
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-black">
                {activeContest.totalEntries}
              </p>
            </div>
            <div className="bg-white p-4">
              <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                Markets
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-black">
                {activeContest.eventCount}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <span className="inline-block border border-black bg-black px-8 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors group-hover:bg-white group-hover:text-black">
              Enter Contest →
            </span>
          </div>
        </Link>
      )}

      {/* ── No active contest ── */}
      {!activeContest && !isLoading && (
        <div className="animate-fade-up border border-neutral-200 p-8 text-center">
          <h2 className="text-lg font-bold uppercase tracking-tight text-black">
            No active contest
          </h2>
          <p className="mt-2 text-sm text-neutral-400">
            Check back soon — new contests drop daily.
          </p>
        </div>
      )}

      {/* ── Loading ── */}
      {isLoading && (
        <div className="animate-pulse border border-neutral-200 p-8">
          <div className="h-6 w-48 bg-neutral-100" />
          <div className="mt-4 h-10 w-96 bg-neutral-100" />
          <div className="mt-6 grid grid-cols-4 gap-px">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-neutral-100" />
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="border border-loss/30 bg-loss/5 p-4 font-mono text-sm text-loss">
          Failed to load contests.
        </div>
      )}
    </>
  );
}
