"use client";

import { useState } from "react";
import type { StandingsEntry } from "@polypool/shared";

function truncateWallet(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

interface LeaderboardProps {
  standings: StandingsEntry[];
  walletAddress: string | null;
}

export function Leaderboard({ standings, walletAddress }: LeaderboardProps) {
  const [showAll, setShowAll] = useState(false);

  if (standings.length === 0) {
    return (
      <div className="border border-neutral-200 p-6 text-center font-mono text-xs text-neutral-400">
        No entries yet
      </div>
    );
  }

  const visible = showAll ? standings : standings.slice(0, 20);

  return (
    <div>
      <div className="overflow-hidden border border-neutral-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-400">
              <th className="px-4 py-2.5 text-left font-bold">#</th>
              <th className="px-4 py-2.5 text-left font-bold">Wallet</th>
              <th className="px-4 py-2.5 text-right font-bold">Correct</th>
              <th className="px-4 py-2.5 text-right font-bold">Score</th>
              <th className="px-4 py-2.5 text-right font-bold">Payout</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => {
              const isMe =
                walletAddress &&
                entry.walletAddress.toLowerCase() === walletAddress.toLowerCase();

              return (
                <tr
                  key={entry.walletAddress}
                  className={`border-b border-neutral-200/50 transition-colors ${
                    isMe
                      ? "bg-black/[0.03]"
                      : "hover:bg-neutral-50"
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <span
                      className={`font-mono text-xs font-bold ${
                        entry.rank === 1
                          ? "text-black"
                          : "text-neutral-400"
                      }`}
                    >
                      {entry.rank}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`font-mono text-xs ${
                        isMe ? "font-bold text-black" : "text-neutral-500"
                      }`}
                    >
                      {truncateWallet(entry.walletAddress)}
                    </span>
                    {isMe && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                        you
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-neutral-400">
                    {entry.correctCount}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-black">
                    {entry.score.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {entry.payoutUsdc != null && entry.payoutUsdc > 0 ? (
                      <span className="font-mono text-xs font-bold text-win">
                        ${entry.payoutUsdc.toFixed(2)}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-neutral-200">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!showAll && standings.length > 20 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 w-full border border-neutral-200 py-2.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 transition-colors hover:border-black hover:text-black"
        >
          Show All ({standings.length})
        </button>
      )}
    </div>
  );
}
