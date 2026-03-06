"use client";

import { use, useEffect, useState } from "react";
import type { ContestEvent } from "@polypool/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useContest, useStandings, useResults, useContestOdds } from "@/hooks/use-contests";
import { usePicksStore } from "@/stores/picks-store";
import { api } from "@/lib/api";
import { sendUsdcTransfer } from "@/lib/solana";
import { getWsUrl } from "@/lib/ws";
import { EventPicker } from "@/components/event-picker";
import { PicksSummaryBar } from "@/components/picks-summary-bar";
import { Leaderboard } from "@/components/leaderboard";
import { ResultsCard } from "@/components/results-card";
import { Countdown } from "@/components/countdown";

type EntryStep = "pick" | "review" | "confirm";

export default function ContestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: contest, isLoading, error } = useContest(id);
  const { data: standings } = useStandings(id);
  const { data: results } = useResults(id);
  const queryClient = useQueryClient();
  const { authenticated, login, wallet, walletAddress } = useAuth();
  const { data: odds } = useContestOdds(id, (contest?.status === "active") || false);
  const picks = usePicksStore((s) => s.picks);
  const setContest = usePicksStore((s) => s.setContest);
  const clearPicks = usePicksStore((s) => s.clearPicks);
  const [step, setStep] = useState<EntryStep>("pick");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (contest && id) {
      setContest(id);
    }
  }, [contest, id, setContest]);

  useEffect(() => {
    if (!id) return;
    const ws = new WebSocket(getWsUrl());

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "subscribe", contestId: id }));
    });

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          type?: string;
          contestId?: string;
        };
        if (msg.contestId !== id) return;

        if (msg.type === "pool_update") {
          void queryClient.invalidateQueries({ queryKey: ["contest", id] });
          void queryClient.invalidateQueries({ queryKey: ["contests"] });
        }
        if (msg.type === "event_resolved") {
          void queryClient.invalidateQueries({ queryKey: ["contest", id] });
          void queryClient.invalidateQueries({ queryKey: ["standings", id] });
        }
        if (msg.type === "leaderboard_update") {
          void queryClient.invalidateQueries({ queryKey: ["standings", id] });
          void queryClient.invalidateQueries({ queryKey: ["results", id] });
        }
        if (msg.type === "contest_status") {
          void queryClient.invalidateQueries({ queryKey: ["contest", id] });
          void queryClient.invalidateQueries({ queryKey: ["contests"] });
          void queryClient.invalidateQueries({ queryKey: ["standings", id] });
          void queryClient.invalidateQueries({ queryKey: ["results", id] });
        }
      } catch {
        // Ignore malformed messages
      }
    });

    return () => {
      try {
        ws.send(JSON.stringify({ type: "unsubscribe" }));
      } catch {
        // ignore
      }
      ws.close();
    };
  }, [id, queryClient]);

  const isActive = contest?.status === "active";
  const isClosed = contest?.status === "closed";
  const isResolved =
    contest?.status === "resolved" || contest?.status === "voided";

  const myResult = results?.find(
    (r) =>
      walletAddress &&
      r.walletAddress.toLowerCase() === walletAddress.toLowerCase()
  );

  const events = contest?.events ?? [];
  const allPicked =
    Object.keys(picks).length >= events.length && events.length > 0;

  const handleSubmit = async () => {
    if (!contest) return;

    if (!authenticated || !wallet) {
      login();
      return;
    }

    if (step === "pick" && allPicked) {
      setStep("review");
      return;
    }

    if (step === "review") {
      setSubmitting(true);
      setSubmitError("");

      try {
        const pickEntries = Object.entries(picks).map(
          ([eventId, pickedOutcome]) => ({
            eventId,
            pickedOutcome,
          })
        );

        if (!contest.vaultAddress) {
          throw new Error("Contest vault is not configured");
        }

        const txSignature = await sendUsdcTransfer(
          wallet as unknown as {
            address: string;
            signTransaction: (tx: any) => Promise<any>;
          },
          contest.vaultAddress,
          contest.entryFeeUsdc
        );

        await api.submitEntry(contest.id, {
          walletAddress: walletAddress ?? "",
          picks: pickEntries,
          txSignature,
        });

        setStep("confirm");
        setSubmitted(true);
        clearPicks();
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Failed to submit entry"
        );
        console.error("Failed to submit entry:", err);
      } finally {
        setSubmitting(false);
      }
    }
  };

  // ── Loading ──
  if (isLoading) {
    return (
      <>
        <div className="h-6 w-48 animate-pulse bg-neutral-100" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse border border-neutral-200 bg-neutral-50"
            />
          ))}
        </div>
      </>
    );
  }

  // ── Error ──
  if (error || !contest) {
    return (
      <div className="text-center font-mono text-sm text-loss">
        Contest not found.
      </div>
    );
  }

  return (
    <div className="pb-20">
      {/* ── Header ── */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="border border-neutral-300 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-neutral-400">
            {contest.category}
          </span>
          {isActive && (
            <span className="border border-win/40 bg-win/5 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-win">
              ● Live
            </span>
          )}
          {isClosed && (
            <span className="border border-neutral-300 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Closed
            </span>
          )}
          {isResolved && (
            <span className="border border-win/30 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-win">
              Final
            </span>
          )}
          {isActive && contest.closesAt && (
            <Countdown targetDate={new Date(contest.closesAt)} />
          )}
        </div>

        <h1 className="mt-3 text-xl font-extrabold uppercase tracking-tight text-black sm:text-2xl">
          {contest.title}
        </h1>
        {contest.description && (
          <p className="mt-1 text-sm text-neutral-400">{contest.description}</p>
        )}

        {/* ── Stats Grid ── */}
        <div className="mt-5 grid grid-cols-4 gap-px border border-neutral-200 bg-neutral-200">
          <div className="bg-white p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400">
              Entry
            </p>
            <p className="mt-0.5 font-mono text-sm font-bold text-black">
              ${contest.entryFeeUsdc}
            </p>
          </div>
          <div className="bg-white p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400">
              Pool
            </p>
            <p className="mt-0.5 font-mono text-sm font-bold text-win">
              ${Number(contest.totalPoolUsdc).toFixed(2)}
            </p>
          </div>
          <div className="bg-white p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400">
              Entries
            </p>
            <p className="mt-0.5 font-mono text-sm font-bold text-black">
              {contest.totalEntries}
            </p>
          </div>
          <div className="bg-white p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400">
              Markets
            </p>
            <p className="mt-0.5 font-mono text-sm font-bold text-black">
              {events.length}
            </p>
          </div>
        </div>

        {/* ── Rake note ── */}
        <div className="mt-2 px-1 font-mono text-[10px] text-neutral-300">
          Winner takes all minus {contest.rakeBps / 100}% rake · Ties split
        </div>

        {/* ── Review Step ── */}
        {step === "review" && isActive && (
          <div className="mt-6 animate-fade-up border border-black/20 p-5">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
              Review Picks
            </h3>
            <div className="mt-3 space-y-2">
              {events.map((event: ContestEvent) => {
                const picked = picks[event.id];
                if (!picked) return null;
                const prob = odds?.[event.id]?.[picked];
                const multiplier = prob && prob > 0 ? (1 / prob).toFixed(2) : "—";
                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-neutral-500">
                      {event.eventTitle}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-black">{picked}</span>
                      {prob != null && (
                        <span className="font-mono text-[10px] text-neutral-400">
                          {(prob * 100).toFixed(0)}%
                        </span>
                      )}
                      <span className="font-mono text-[10px] font-bold text-win">
                        ×{multiplier}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {odds && (
              <div className="mt-4 flex items-baseline justify-end gap-2 border-t border-neutral-200 pt-3">
                <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                  Max score if all correct
                </span>
                <span className="font-mono text-sm font-bold text-win">
                  {events
                    .reduce((sum, event) => {
                      const picked = picks[event.id];
                      if (!picked) return sum;
                      const prob = odds[event.id]?.[picked];
                      return sum + (prob && prob > 0 ? 1 / prob : 0);
                    }, 0)
                    .toFixed(2)}pts
                </span>
              </div>
            )}
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={() => setStep("pick")}
                className="border border-neutral-300 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
              >
                Edit
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="border border-black bg-black px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black disabled:opacity-50"
              >
                {submitting
                  ? "Submitting…"
                  : `Confirm — $${contest.entryFeeUsdc} USDC`}
              </button>
            </div>
            {submitError && (
              <p className="mt-3 font-mono text-xs text-loss">{submitError}</p>
            )}
          </div>
        )}

        {/* ── Submitted ── */}
        {submitted && (
          <div className="mt-4 border border-win/30 bg-win/5 p-4 font-mono text-sm text-win">
            Entry submitted. Good luck.
          </div>
        )}

        {/* ── Results Card ── */}
        {isResolved && myResult && (
          <div className="mt-6 animate-fade-up">
            <ResultsCard
              score={myResult.score}
              correctCount={myResult.correctCount}
              totalEvents={events.length}
              rank={myResult.rank}
              totalEntrants={contest.totalEntries}
              payoutUsdc={myResult.payoutUsdc}
              payoutTxSignature={null}
            />
          </div>
        )}

        {/* ── Events ── */}
        <div className="mt-8 space-y-2">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            {isActive && step === "pick" ? "Make Your Picks" : "Markets"}
          </h2>
          {[...events]
            .sort(
              (a: ContestEvent, b: ContestEvent) => a.sortOrder - b.sortOrder
            )
            .map((event: ContestEvent) => (
              <EventPicker
                key={event.id}
                event={event}
                locked={!isActive || submitted || step === "review"}
                odds={odds?.[event.id]}
              />
            ))}
        </div>

        {/* ── Leaderboard ── */}
        {(isClosed || isResolved) && standings && standings.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
              Leaderboard
            </h2>
            <Leaderboard standings={standings} walletAddress={walletAddress} />
          </div>
        )}

      {/* ── Bottom Bar ── */}
      {isActive && step === "pick" && !submitted && (
        <PicksSummaryBar
          events={events}
          entryFeeUsdc={contest.entryFeeUsdc}
          onSubmit={handleSubmit}
          submitting={submitting}
          odds={odds}
        />
      )}
    </div>
  );
}
