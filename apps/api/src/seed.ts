/**
 * Seed script — creates a test contest from live Polymarket events.
 *
 * Usage: pnpm seed
 */
import "dotenv/config";
import { GAMMA_API_BASE } from "@polypool/shared";
import { createContest, transitionContest } from "./services/contest-manager";

async function fetchActiveEvents(limit = 8) {
  const params = new URLSearchParams({
    limit: String(limit),
    active: "true",
    closed: "false",
    order: "volume",
    ascending: "false",
  });

  const resp = await fetch(`${GAMMA_API_BASE}/events?${params}`);
  if (!resp.ok) throw new Error(`Gamma API error: ${resp.status}`);
  const events: Array<Record<string, unknown>> = await resp.json();

  // Filter to events that have at least one market with a conditionId
  return events.filter((evt) => {
    const markets = Array.isArray(evt.markets) ? evt.markets : [];
    return markets.length > 0 && (markets[0] as Record<string, unknown>).conditionId;
  });
}

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

async function main() {
  console.log("Fetching active events from Polymarket...\n");

  const rawEvents = await fetchActiveEvents();
  if (rawEvents.length === 0) {
    console.error("No active events found on Polymarket!");
    process.exit(1);
  }

  // Take up to 5 events
  const selected = rawEvents.slice(0, 5);

  const closesAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
  const vaultAddress = process.env.SEED_VAULT_ADDRESS ?? process.env.TREASURY_WALLET;
  if (!vaultAddress) {
    throw new Error("SEED_VAULT_ADDRESS (or TREASURY_WALLET) is required for seed");
  }

  const eventInputs = selected.map((evt, i) => {
    const markets = (evt.markets as Array<Record<string, unknown>>) ?? [];
    const mkt = markets[0] as Record<string, unknown>;
    const tokenIds = parseJsonField(mkt.clobTokenIds);
    const outcomes = parseJsonField(mkt.outcomes);

    return {
      polymarketSlug: String(evt.slug ?? ""),
      polymarketConditionId: String(mkt.conditionId ?? ""),
      eventTitle: String(mkt.question ?? evt.title ?? "Unknown"),
      outcomes:
        outcomes.length >= 2
          ? outcomes.map((label, j) => ({
              label,
              tokenId: tokenIds[j] ?? "",
            }))
          : [
              { label: "Yes", tokenId: tokenIds[0] ?? "" },
              { label: "No", tokenId: tokenIds[1] ?? "" },
            ],
      sortOrder: i,
    };
  });

  console.log(`Creating contest with ${eventInputs.length} events...`);
  console.log(`Closes at: ${closesAt.toISOString()}\n`);

  const contest = await createContest({
    title: `Daily Mix — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    description: "A test contest seeded from live Polymarket events.",
    category: "mixed",
    entryFeeUsdc: 1,
    rakeBps: 1000,
    minEntries: 1,
    vaultAddress,
    closesAt: closesAt.toISOString(),
    events: eventInputs,
  });

  console.log(`Contest created: ${contest.id}`);
  console.log(`Title: ${contest.title}`);

  // Transition to active
  await transitionContest(contest.id, "active");
  console.log("Status: active\n");

  console.log("Events:");
  for (const evt of eventInputs) {
    const outcomeLabels = evt.outcomes.map((o) => o.label).join(" / ");
    console.log(`  ${evt.sortOrder + 1}. ${evt.eventTitle}`);
    console.log(`     Outcomes: ${outcomeLabels}`);
  }

  console.log(`\n--- Use this for dev:resolve ---`);
  console.log(`CONTEST_ID=${contest.id} pnpm dev:resolve`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
