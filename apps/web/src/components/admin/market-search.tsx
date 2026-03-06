"use client";

import { useState } from "react";
import type {
  PolymarketEvent,
  PolymarketMarket,
  CreateContestEventInput,
} from "@polypool/shared";
import { api } from "@/lib/api";

interface MarketSearchProps {
  onAddLeg: (leg: CreateContestEventInput) => void;
  addedConditionIds: Set<string>;
}

function extractSlug(input: string): string | null {
  const trimmed = input.trim();

  // Handle full URL: https://polymarket.com/event/some-slug or .../event/some-slug/market-slug
  const urlMatch = trimmed.match(/polymarket\.com\/event\/([^/?#]+)/);
  if (urlMatch) return urlMatch[1];

  // Handle bare slug (no slashes, no spaces)
  if (/^[a-z0-9-]+$/.test(trimmed)) return trimmed;

  return null;
}

export function MarketSearch({ onAddLeg, addedConditionIds }: MarketSearchProps) {
  const [url, setUrl] = useState("");
  const [event, setEvent] = useState<PolymarketEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFetch = async () => {
    const slug = extractSlug(url);
    if (!slug) {
      setError("Paste a Polymarket event URL or slug.");
      return;
    }

    setLoading(true);
    setError("");
    setEvent(null);

    try {
      const data = await api.fetchEventBySlug(slug);
      if (!data || data.markets.length === 0) {
        setError("No markets found for this event.");
        return;
      }
      setEvent(data);
    } catch {
      setError("Failed to fetch event. Check the URL and try again.");
    } finally {
      setLoading(false);
    }
  };

  const addMarket = (market: PolymarketMarket) => {
    if (!event) return;
    onAddLeg({
      polymarketSlug: event.slug,
      polymarketConditionId: market.conditionId,
      eventTitle: market.question,
      outcomes: market.outcomes.map((label, i) => ({
        label,
        tokenId: market.tokenIds[i],
      })),
      sortOrder: 0,
      marketEndDate: market.endDate,
    });
  };

  const formatPct = (price: number) => `${Math.round(price * 100)}%`;

  return (
    <div className="space-y-3">
      <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
        Add Polymarket Event
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFetch()}
          placeholder="Paste Polymarket event URL..."
          className="min-w-0 flex-1 border border-neutral-300 bg-white px-4 py-2.5 font-mono text-sm text-black placeholder-neutral-400 outline-none focus:border-black"
        />
        <button
          onClick={handleFetch}
          disabled={loading || !url.trim()}
          className="shrink-0 border border-black bg-black px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black disabled:opacity-40"
        >
          {loading ? "Loading..." : "Fetch"}
        </button>
      </div>

      {error && (
        <div className="border border-loss/30 bg-loss/5 p-3 font-mono text-sm text-loss">
          {error}
        </div>
      )}

      {event && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-black">{event.title}</p>
          {event.markets.map((market) => {
            const added = addedConditionIds.has(market.conditionId);
            return (
              <div
                key={market.conditionId}
                className="flex items-start gap-3 border border-neutral-200 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-black">
                    {market.question}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {market.outcomes.map((outcome, i) => (
                      <span
                        key={outcome}
                        className="inline-flex items-center gap-1 border border-neutral-200 px-2 py-0.5 font-mono text-[10px] text-neutral-500"
                      >
                        {outcome}{" "}
                        <span className="font-bold text-black">
                          {formatPct(market.outcomePrices[i])}
                        </span>
                      </span>
                    ))}
                  </div>
                  {market.volume > 0 && (
                    <p className="mt-1 font-mono text-[10px] text-neutral-300">
                      Vol: ${market.volume.toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => addMarket(market)}
                  disabled={added || market.closed}
                  className={`shrink-0 border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    added
                      ? "cursor-default border-win/30 bg-win/5 text-win"
                      : market.closed
                        ? "cursor-not-allowed border-neutral-200 text-neutral-300"
                        : "border-neutral-400 text-neutral-500 hover:border-black hover:text-black"
                  }`}
                >
                  {added ? "Added" : market.closed ? "Closed" : "+ Add"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
