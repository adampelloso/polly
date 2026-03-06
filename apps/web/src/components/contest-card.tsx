"use client";

import Link from "next/link";
import type { ContestListItem } from "@polypool/shared";
import { Countdown } from "./countdown";

const statusLabel: Record<string, string> = {
  active: "● LIVE",
  closed: "CLOSED",
  resolved: "FINAL",
  voided: "VOID",
  cancelled: "CANCELLED",
  draft: "DRAFT",
};

export function ContestCard({ contest }: { contest: ContestListItem }) {
  const isActive = contest.status === "active";
  const status = statusLabel[contest.status] ?? "—";

  return (
    <Link
      href={`/contests/${contest.id}`}
      className="group block p-5 transition-colors hover:bg-neutral-50"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
          {contest.category}
        </span>
        <span
          className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
            isActive
              ? "text-win"
              : contest.status === "voided" || contest.status === "cancelled"
                ? "text-loss"
                : "text-neutral-400"
          }`}
        >
          {status}
        </span>
      </div>

      <h3 className="mt-2 text-sm font-bold uppercase tracking-tight text-black transition-colors group-hover:text-neutral-700">
        {contest.title}
      </h3>

      <div className="mt-2 flex items-center gap-3 font-mono text-[11px] text-neutral-400">
        <span>{contest.eventCount} mkts</span>
        <span>·</span>
        <span>${contest.entryFeeUsdc}</span>
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-neutral-200 pt-3">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-neutral-400">
            Pool{" "}
          </span>
          <span className="font-mono text-sm font-bold text-win">
            ${Number(contest.totalPoolUsdc).toFixed(2)}
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-neutral-400">
            Entries{" "}
          </span>
          <span className="font-mono text-sm font-bold text-black">
            {contest.totalEntries}
          </span>
        </div>
        {isActive && contest.closesAt ? (
          <Countdown targetDate={new Date(contest.closesAt)} prefix="" />
        ) : null}
      </div>

      <div className="mt-4">
        <span
          className={`block border py-2 text-center text-[10px] font-bold uppercase tracking-widest transition-colors ${
            isActive
              ? "border-black text-black group-hover:bg-black group-hover:text-white"
              : "border-neutral-200 text-neutral-400"
          }`}
        >
          {isActive ? "Enter" : "View"}
        </span>
      </div>
    </Link>
  );
}
