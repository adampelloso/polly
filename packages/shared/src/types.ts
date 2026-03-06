// ── Enums ──

export const ContestStatus = {
  DRAFT: "draft",
  ACTIVE: "active",
  CLOSED: "closed",
  RESOLVED: "resolved",
  VOIDED: "voided",
  CANCELLED: "cancelled",
} as const;
export type ContestStatus = (typeof ContestStatus)[keyof typeof ContestStatus];

export const ContestCategory = {
  SPORTS: "sports",
  POLITICS: "politics",
  CRYPTO: "crypto",
  CULTURE: "culture",
  MIXED: "mixed",
} as const;
export type ContestCategory =
  (typeof ContestCategory)[keyof typeof ContestCategory];

export const EventStatus = {
  PENDING: "pending",
  RESOLVED: "resolved",
  VOIDED: "voided",
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const PayoutType = {
  PRIZE: "prize",
  RAKE: "rake",
  REFUND: "refund",
} as const;
export type PayoutType = (typeof PayoutType)[keyof typeof PayoutType];

// ── Contest ──

export interface Contest {
  id: string;
  title: string;
  description: string;
  category: ContestCategory;
  status: ContestStatus;
  entryFeeUsdc: number;
  rakeBps: number;
  minEntries: number;
  maxEntries: number | null;
  closesAt: Date | null;
  vaultAddress: string | null;
  totalEntries: number;
  totalPoolUsdc: number;
  winnerEntryId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

// ── Contest Event ──

export interface ContestEvent {
  id: string;
  contestId: string;
  polymarketSlug: string;
  polymarketConditionId: string;
  eventTitle: string;
  outcomes: EventOutcome[];
  sortOrder: number;
  resolvedOutcome: string | null;
  resolvedAt: Date | null;
  status: EventStatus;
}

export interface EventOutcome {
  label: string;
  tokenId: string;
}

// ── Entry ──

export interface Entry {
  id: string;
  contestId: string;
  walletAddress: string;
  picks: Pick[];
  oddsSnapshot?: Record<string, Record<string, number>>;
  entryTxSignature: string;
  score: number | null;
  correctCount: number | null;
  payoutUsdc: number | null;
  payoutTxSignature: string | null;
  enteredAt: Date;
  scoredAt: Date | null;
}

export interface Pick {
  eventId: string;
  pickedOutcome: string;
}

// ── Scoring ──

export interface ScoredEntry {
  entryId: string;
  walletAddress: string;
  score: number;
  correctCount: number;
  picks: ScoredPick[];
  rank: number;
  payoutUsdc: number;
}

export interface ScoredPick {
  eventId: string;
  pickedOutcome: string;
  resolvedOutcome: string | null;
  correct: boolean;
  probability: number;
  pointsEarned: number;
}

// ── Payouts ──

export interface PayoutRecord {
  id: string;
  contestId: string;
  walletAddress: string;
  amountUsdc: number;
  type: PayoutType;
  txSignature: string;
  createdAt: Date;
}

// ── API Request/Response Types ──

export interface CreateContestRequest {
  title: string;
  description: string;
  category: ContestCategory;
  entryFeeUsdc: number;
  rakeBps: number;
  minEntries: number;
  maxEntries?: number | null;
  vaultAddress?: string | null;
  closesAt?: string; // ISO 8601
  events: CreateContestEventInput[];
}

export interface CreateContestEventInput {
  polymarketSlug: string;
  polymarketConditionId: string;
  eventTitle: string;
  outcomes: EventOutcome[];
  sortOrder: number;
  marketEndDate?: string | null;
}

export interface SubmitEntryRequest {
  walletAddress: string;
  picks: Pick[];
  txSignature: string;
}

export interface ContestListItem {
  id: string;
  title: string;
  category: ContestCategory;
  status: ContestStatus;
  entryFeeUsdc: number;
  totalEntries: number;
  totalPoolUsdc: number;
  closesAt: string | null;
  eventCount: number;
}

export interface ContestDetail extends Contest {
  events: ContestEvent[];
}

export interface StandingsEntry {
  walletAddress: string;
  score: number;
  correctCount: number;
  rank: number;
  payoutUsdc: number | null;
}

export interface LeaderboardEntry extends StandingsEntry {
  picks: ScoredPick[];
}

// ── Polymarket API Types ──

export interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  markets: PolymarketMarket[];
}

export interface PolymarketMarket {
  conditionId: string;
  question: string;
  outcomes: string[];
  outcomePrices: number[];
  tokenIds: string[];
  volume: number;
  endDate: string | null;
  closed: boolean;
}
