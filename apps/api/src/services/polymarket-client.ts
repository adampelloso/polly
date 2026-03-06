/**
 * Polymarket API client — fetches events, prices, and resolution status.
 *
 * Key gotchas:
 * - `clobTokenIds` and `outcomePrices` from Gamma API are JSON-encoded STRINGS, not arrays
 * - Resolution detection uses outcomePrices ["1","0"] / ["0","1"], NOT the `resolved` field
 */

import {
  GAMMA_API_BASE,
  CLOB_API_BASE,
  type PolymarketMarket,
  type PolymarketEvent,
} from "@polypool/shared";

// ── Helpers ──

function parseJsonField(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeGammaMarket(mkt: Record<string, unknown>): PolymarketMarket {
  const tokenIds = parseJsonField(mkt.clobTokenIds);
  const outcomePrices = parseJsonField(mkt.outcomePrices);
  const outcomes = parseJsonField(mkt.outcomes);

  return {
    conditionId: String(mkt.conditionId ?? ""),
    question: String(mkt.question ?? ""),
    outcomes: outcomes.length > 0 ? outcomes : ["Yes", "No"],
    outcomePrices: outcomePrices.map((p) => parseFloat(p) || 0),
    tokenIds,
    volume: Number(mkt.volume ?? 0),
    endDate: mkt.endDate ? String(mkt.endDate) : null,
    closed: Boolean(mkt.closed),
  };
}

// ── Search ──

export async function searchEvents(
  query?: string,
  tag?: string,
  limit = 20
): Promise<PolymarketEvent[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    active: "true",
    closed: "false",
  });
  if (query) params.set("title", query);
  if (tag) params.set("tag", tag);

  const resp = await fetch(`${GAMMA_API_BASE}/events?${params}`);
  if (!resp.ok) throw new Error(`Gamma search failed: ${resp.status}`);

  const events: Array<Record<string, unknown>> = await resp.json();
  return events.map((evt) => ({
    id: String(evt.id ?? ""),
    title: String(evt.title ?? ""),
    slug: String(evt.slug ?? ""),
    markets: Array.isArray(evt.markets)
      ? evt.markets.map((m: Record<string, unknown>) =>
          normalizeGammaMarket(m)
        )
      : [],
  }));
}

// ── Single Market ──

export async function fetchMarket(
  conditionId: string
): Promise<PolymarketMarket | null> {
  const resp = await fetch(`${CLOB_API_BASE}/markets/${conditionId}`);
  if (!resp.ok) return null;

  const mkt: Record<string, unknown> = await resp.json();
  const tokens = Array.isArray(mkt.tokens)
    ? (mkt.tokens as Array<Record<string, unknown>>)
    : [];

  return {
    conditionId: String(mkt.condition_id ?? conditionId),
    question: String(mkt.question ?? ""),
    outcomes:
      tokens.length >= 2
        ? [
            String(tokens[0].outcome ?? "Yes"),
            String(tokens[1].outcome ?? "No"),
          ]
        : ["Yes", "No"],
    outcomePrices: tokens.map((t) => parseFloat(String(t.price ?? 0))),
    tokenIds: tokens.map((t) => String(t.token_id ?? "")),
    volume: Number(mkt.volume ?? 0),
    endDate: mkt.end_date_iso ? String(mkt.end_date_iso) : null,
    closed: Boolean(mkt.closed),
  };
}

// ── Prices ──

export async function getPrices(
  conditionId: string
): Promise<Record<string, number>> {
  const mkt = await fetchMarket(conditionId);
  if (!mkt) return {};

  const prices: Record<string, number> = {};
  mkt.outcomes.forEach((outcome, i) => {
    prices[outcome] = mkt.outcomePrices[i] ?? 0;
  });
  return prices;
}

// ── Entry-Time Odds ──

/**
 * Fetch current odds for multiple markets at entry time.
 * Returns a map of conditionId -> outcome label -> probability.
 */
export async function getEntryOdds(
  conditionIds: string[]
): Promise<Record<string, Record<string, number>>> {
  const result: Record<string, Record<string, number>> = {};

  await Promise.all(
    conditionIds.map(async (conditionId) => {
      const prices = await getPrices(conditionId);
      if (Object.keys(prices).length > 0) {
        result[conditionId] = prices;
      }
    })
  );

  return result;
}

// ── Fetch Event by Slug ──

export async function fetchEventBySlug(
  slug: string
): Promise<PolymarketEvent | null> {
  const resp = await fetch(`${GAMMA_API_BASE}/events?slug=${encodeURIComponent(slug)}&limit=1`);
  if (!resp.ok) return null;

  const events: Array<Record<string, unknown>> = await resp.json();
  const evt = events[0];
  if (!evt) return null;

  return {
    id: String(evt.id ?? ""),
    title: String(evt.title ?? ""),
    slug: String(evt.slug ?? ""),
    markets: Array.isArray(evt.markets)
      ? evt.markets.map((m: Record<string, unknown>) => normalizeGammaMarket(m))
      : [],
  };
}

// ── Resolution ──

export interface ResolutionResult {
  resolved: boolean;
  winningOutcome: string | null;
}

/**
 * Check if a market has resolved.
 *
 * Resolution detection: outcomePrices of ["1","0"] means first outcome won,
 * ["0","1"] means second outcome won. The `resolved` field is unreliable.
 */
export async function checkResolution(
  conditionId: string
): Promise<ResolutionResult> {
  // Try Gamma API first (has outcomePrices in the right format)
  try {
    const resp = await fetch(
      `${GAMMA_API_BASE}/markets?condition_id=${conditionId}&limit=1`
    );
    if (resp.ok) {
      const markets: Array<Record<string, unknown>> = await resp.json();
      const mkt = markets[0];
      if (mkt) {
        const outcomePrices = parseJsonField(mkt.outcomePrices);
        const outcomes = parseJsonField(mkt.outcomes);

        if (outcomePrices.length >= 2) {
          const p0 = parseFloat(outcomePrices[0]);
          const p1 = parseFloat(outcomePrices[1]);

          if (p0 === 1 && p1 === 0) {
            return {
              resolved: true,
              winningOutcome: outcomes[0] ?? "Yes",
            };
          }
          if (p0 === 0 && p1 === 1) {
            return {
              resolved: true,
              winningOutcome: outcomes[1] ?? "No",
            };
          }
        }
      }
    }
  } catch {
    // Fall through to CLOB check
  }

  // Fallback: CLOB API
  return checkResolutionClob(conditionId);
}

async function checkResolutionClob(
  conditionId: string
): Promise<ResolutionResult> {
  try {
    const resp = await fetch(`${CLOB_API_BASE}/markets/${conditionId}`);
    if (!resp.ok) return { resolved: false, winningOutcome: null };

    const mkt: Record<string, unknown> = await resp.json();
    if (!mkt.closed) return { resolved: false, winningOutcome: null };

    const tokens = Array.isArray(mkt.tokens)
      ? (mkt.tokens as Array<Record<string, unknown>>)
      : [];
    if (tokens.length < 2) return { resolved: false, winningOutcome: null };

    if (tokens[0].winner) {
      return {
        resolved: true,
        winningOutcome: String(tokens[0].outcome ?? "Yes"),
      };
    }
    if (tokens[1].winner) {
      return {
        resolved: true,
        winningOutcome: String(tokens[1].outcome ?? "No"),
      };
    }

    return { resolved: false, winningOutcome: null };
  } catch {
    return { resolved: false, winningOutcome: null };
  }
}
