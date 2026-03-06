"use client";

import { useState } from "react";
import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "Pick",
    description:
      "Choose YES or NO for each market in the daily contest. 5-10 Polymarket prediction markets, curated by the Polly team.",
  },
  {
    number: "02",
    title: "Pay",
    description:
      "Flat USDC entry fee -- that's your max risk. Entry fees pool together into the prize pool. USDC is held in a Solana smart contract vault.",
  },
  {
    number: "03",
    title: "Score",
    description:
      "Correct picks earn points weighted by difficulty. Your multiplier = 1 / odds at time of entry. Picking a 30% underdog correctly earns 3.33x. Picking an 85% favorite correctly earns 1.18x. Odds are locked at the moment you enter.",
  },
  {
    number: "04",
    title: "Win",
    description:
      "Highest score wins the entire prize pool (minus rake). Winner take all. Ties split the pot evenly. Payouts hit your wallet automatically on-chain.",
  },
];

const examplePicks = [
  { market: "Will BTC hit $100k by March?", pick: "Yes", odds: 0.30, correct: true },
  { market: "Will the Fed cut rates?", pick: "No", odds: 0.22, correct: true },
  { market: "Will ETH flip SOL in volume?", pick: "Yes", odds: 0.85, correct: true },
  { market: "Will Elon tweet about Doge?", pick: "Yes", odds: 0.12, correct: false },
  { market: "Will Trump win the primary?", pick: "No", odds: 0.28, correct: true },
];

const faqs = [
  {
    q: "How does scoring work?",
    a: "Each correct pick earns points = 1 / (odds at entry time). If you pick YES at 30% and it resolves YES, you get 1/0.30 = 3.33 points. Incorrect picks earn 0. Total score = sum of points from all correct picks.",
  },
  {
    q: "What happens if a market is delayed or voided?",
    a: "If a Polymarket market is voided or cancelled, that market is removed from scoring. Scores are recalculated across the remaining markets only. If a market is delayed, the contest waits for Polymarket to resolve it.",
  },
  {
    q: "Who wins?",
    a: "The single highest scorer wins the entire prize pool minus the platform rake. If two or more users tie, the pot is split evenly among them.",
  },
  {
    q: "What is the rake?",
    a: "The platform takes a percentage of the total prize pool (shown on each contest). This covers operating costs. The remaining pool goes entirely to the winner.",
  },
  {
    q: "Is this on-chain?",
    a: "Entry fees and payouts are USDC on Solana. Funds are held in a program-controlled vault (PDA). Scoring is computed off-chain using odds locked at each user's entry time.",
  },
  {
    q: "Can I enter multiple times?",
    a: "Yes. Each entry requires a separate fee and gets its own odds snapshot. Multiple entries are allowed and encouraged -- it makes the pool bigger.",
  },
  {
    q: "Can I change my picks?",
    a: "No. Once submitted, picks are final. The odds at your entry time are locked permanently.",
  },
  {
    q: "Do I need a crypto wallet?",
    a: "You can sign up with email and Polly creates an embedded wallet for you (via Privy). You'll need to deposit USDC to enter. Or connect an existing Solana wallet like Phantom.",
  },
];

export default function HowItWorksPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <>
      <h1 className="text-xl font-extrabold uppercase tracking-tight text-black sm:text-2xl">
        How It Works
      </h1>
        <p className="mt-2 font-mono text-sm text-neutral-400">
          PvP prediction markets. Your read vs. everyone else's.
        </p>

        {/* Steps */}
        <div className="mt-10 space-y-px">
          {steps.map((step) => (
            <div
              key={step.number}
              className="border border-neutral-200 p-6"
            >
              <div className="flex items-center gap-4">
                <span className="font-mono text-2xl font-bold text-neutral-300">
                  {step.number}
                </span>
                <h2 className="text-sm font-extrabold uppercase tracking-widest text-black">
                  {step.title}
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-neutral-500">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        {/* Scoring example */}
        <div className="mt-12">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            Scoring Example
          </h2>
          <p className="mt-2 font-mono text-sm text-neutral-400">
            Points = 1 / probability at entry. Harder correct picks earn more.
          </p>

          <div className="mt-4 overflow-hidden border border-neutral-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-400">
                  <th className="px-4 py-2.5 text-left font-bold">Market</th>
                  <th className="px-4 py-2.5 text-left font-bold">Pick</th>
                  <th className="px-4 py-2.5 text-right font-bold">Odds</th>
                  <th className="px-4 py-2.5 text-right font-bold">Points</th>
                </tr>
              </thead>
              <tbody>
                {examplePicks.map((pick) => (
                  <tr
                    key={pick.market}
                    className="border-b border-neutral-200/50"
                  >
                    <td className="px-4 py-2.5 text-neutral-700">
                      {pick.market}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-neutral-500">
                      {pick.pick}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-neutral-400">
                      {(pick.odds * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {pick.correct ? (
                        <span className="font-mono font-bold text-win">
                          {(1 / pick.odds).toFixed(2)}
                        </span>
                      ) : (
                        <span className="font-mono text-loss">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-50">
                  <td
                    colSpan={3}
                    className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-neutral-400"
                  >
                    Total Score
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-lg font-bold text-black">
                    {examplePicks
                      .reduce(
                        (sum, p) => sum + (p.correct ? 1 / p.odds : 0),
                        0
                      )
                      .toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Disclosures */}
        <div className="mt-12 border border-neutral-200 p-6">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            Disclosures
          </h2>
          <ul className="mt-3 space-y-2 font-mono text-xs text-neutral-400">
            <li>
              Winner take all. Only the highest scorer receives the prize pool (minus rake).
            </li>
            <li>
              Rake is deducted from the total pool before payout. The rake percentage is shown on each contest.
            </li>
            <li>
              No guarantees. Polly does not guarantee returns. You can lose your entire entry fee.
            </li>
            <li>
              USDC only. No fiat on/off ramps. Funds are held in a Solana smart contract vault.
            </li>
            <li>
              Polymarket is the oracle. All market resolution comes from Polymarket. Polly does not adjudicate outcomes.
            </li>
          </ul>
        </div>

        {/* FAQ */}
        <div className="mt-12">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            FAQ
          </h2>
          <div className="mt-4 space-y-px">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="border border-neutral-200"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-neutral-700 hover:text-black"
                >
                  {faq.q}
                  <span className="ml-2 font-mono text-neutral-400">
                    {openFaq === i ? "−" : "+"}
                  </span>
                </button>
                {openFaq === i && (
                  <div className="border-t border-neutral-200 px-4 py-3 text-sm leading-relaxed text-neutral-400">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex border border-black bg-black px-8 py-3 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black"
          >
            Enter Today's Contest
          </Link>
        </div>
    </>
  );
}
