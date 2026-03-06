"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useContests } from "@/hooks/use-contests";
import { Countdown } from "@/components/countdown";

type Tab = "active" | "history";

export default function MyPicksPage() {
  const [tab, setTab] = useState<Tab>("active");
  const { authenticated, login } = useAuth();
  const { data: contests } = useContests();

  const active =
    contests?.filter(
      (c) => c.status === "active" || c.status === "closed"
    ) ?? [];
  const history =
    contests?.filter((c) => c.status === "resolved") ?? [];

  return (
    <>
      <h1 className="text-xl font-extrabold uppercase tracking-tight text-black">
        My Picks
      </h1>

        {!authenticated && (
          <div className="mt-6 border border-neutral-200 p-8 text-center">
            <p className="font-mono text-sm text-neutral-400">
              Connect your wallet to see your picks.
            </p>
            <button
              onClick={login}
              className="mt-4 border border-black bg-black px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black"
            >
              Connect Wallet
            </button>
          </div>
        )}

        {authenticated && (
          <>
            <div className="mt-4 flex border border-neutral-200">
              <button
                onClick={() => setTab("active")}
                className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  tab === "active"
                    ? "bg-black text-white"
                    : "text-neutral-400 hover:text-black"
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setTab("history")}
                className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  tab === "history"
                    ? "bg-black text-white"
                    : "text-neutral-400 hover:text-black"
                }`}
              >
                History
              </button>
            </div>

            {tab === "active" && (
              <div className="mt-4 space-y-2">
                {active.length === 0 ? (
                  <div className="border border-neutral-200 p-8 text-center font-mono text-sm text-neutral-300">
                    No active contests. Browse contests to enter.
                  </div>
                ) : (
                  active.map((c) => (
                    <Link
                      key={c.id}
                      href={`/contests/${c.id}`}
                      className="block border border-neutral-200 p-4 transition-all hover:border-black"
                    >
                      <div className="flex items-start justify-between">
                        <h3 className="text-sm font-bold text-black">
                          {c.title}
                        </h3>
                        <span className="border border-win/40 bg-win/5 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-win">
                          {c.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-neutral-400">
                        <span>{c.eventCount} markets</span>
                        <span className="text-win">${c.totalPoolUsdc.toFixed(2)} pool</span>
                        {c.status === "active" && c.closesAt && (
                          <Countdown
                            targetDate={new Date(c.closesAt)}
                            prefix="Closes"
                          />
                        )}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}

            {tab === "history" && (
              <div className="mt-4 space-y-2">
                {history.length === 0 ? (
                  <div className="border border-neutral-200 p-8 text-center font-mono text-sm text-neutral-300">
                    No past contests.
                  </div>
                ) : (
                  history.map((c) => (
                    <Link
                      key={c.id}
                      href={`/contests/${c.id}`}
                      className="block border border-neutral-200 p-4 transition-all hover:border-black"
                    >
                      <div className="flex items-start justify-between">
                        <h3 className="text-sm font-bold text-black">
                          {c.title}
                        </h3>
                        <span className="border border-neutral-300 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-neutral-400">
                          Final
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-neutral-400">
                        <span>{c.eventCount} markets</span>
                        <span>${c.totalPoolUsdc.toFixed(2)} pool</span>
                        <span>{c.totalEntries} entries</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}
          </>
        )}
    </>
  );
}
