import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  decimal,
  boolean,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── Enums ──

export const contestStatusEnum = pgEnum("contest_status", [
  "draft",
  "active",
  "closed",
  "resolved",
  "voided",
  "cancelled",
]);

export const contestCategoryEnum = pgEnum("contest_category", [
  "sports",
  "politics",
  "crypto",
  "culture",
  "mixed",
]);

export const eventStatusEnum = pgEnum("event_status", [
  "pending",
  "resolved",
  "voided",
]);

export const payoutTypeEnum = pgEnum("payout_type", [
  "prize",
  "rake",
  "refund",
]);

// ── Tables ──

export const contests = pgTable("contests", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: contestCategoryEnum("category").notNull().default("sports"),
  status: contestStatusEnum("status").notNull().default("draft"),
  entryFeeUsdc: decimal("entry_fee_usdc", { precision: 12, scale: 2 })
    .notNull()
    .default("5.00"),
  rakeBps: integer("rake_bps").notNull().default(1000),
  minEntries: integer("min_entries").notNull().default(2),
  maxEntries: integer("max_entries"),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  vaultAddress: text("vault_address"),
  totalEntries: integer("total_entries").notNull().default(0),
  totalPoolUsdc: decimal("total_pool_usdc", { precision: 12, scale: 2 })
    .notNull()
    .default("0.00"),
  winnerEntryId: uuid("winner_entry_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const contestEvents = pgTable(
  "contest_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contestId: uuid("contest_id")
      .notNull()
      .references(() => contests.id),
    polymarketSlug: text("polymarket_slug").notNull(),
    polymarketConditionId: text("polymarket_condition_id").notNull(),
    eventTitle: text("event_title").notNull(),
    outcomes: jsonb("outcomes").notNull().$type<
      Array<{ label: string; tokenId: string }>
    >(),
    sortOrder: integer("sort_order").notNull().default(0),
    resolvedOutcome: text("resolved_outcome"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    status: eventStatusEnum("status").notNull().default("pending"),
  },
  (table) => ({
    contestSortOrderIdx: index("contest_events_contest_sort_idx").on(
      table.contestId,
      table.sortOrder
    ),
    contestConditionUnique: uniqueIndex(
      "contest_events_contest_condition_unique"
    ).on(table.contestId, table.polymarketConditionId),
  })
);

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contestId: uuid("contest_id")
      .notNull()
      .references(() => contests.id),
    walletAddress: text("wallet_address").notNull(),
    picks: jsonb("picks").notNull().$type<
      Array<{ eventId: string; pickedOutcome: string }>
    >(),
    oddsSnapshot: jsonb("odds_snapshot").$type<
      Record<string, Record<string, number>>
    >(),
    entryTxSignature: text("entry_tx_signature").notNull(),
    score: decimal("score", { precision: 12, scale: 6 }),
    correctCount: integer("correct_count"),
    payoutUsdc: decimal("payout_usdc", { precision: 12, scale: 2 }),
    payoutTxSignature: text("payout_tx_signature"),
    enteredAt: timestamp("entered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    scoredAt: timestamp("scored_at", { withTimezone: true }),
  },
  (table) => ({
    entryTxSignatureUnique: uniqueIndex("entries_tx_signature_unique").on(
      table.entryTxSignature
    ),
    contestEnteredAtIdx: index("entries_contest_entered_at_idx").on(
      table.contestId,
      table.enteredAt
    ),
  })
);

export const payoutsLog = pgTable("payouts_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  contestId: uuid("contest_id")
    .notNull()
    .references(() => contests.id),
  walletAddress: text("wallet_address").notNull(),
  amountUsdc: decimal("amount_usdc", { precision: 12, scale: 2 }).notNull(),
  type: payoutTypeEnum("type").notNull(),
  txSignature: text("tx_signature").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
