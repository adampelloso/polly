CREATE TYPE "public"."contest_category" AS ENUM('sports', 'politics', 'crypto', 'culture', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."contest_status" AS ENUM('draft', 'active', 'closed', 'resolved', 'voided', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('pending', 'resolved', 'voided');--> statement-breakpoint
CREATE TYPE "public"."payout_type" AS ENUM('prize', 'rake', 'refund');--> statement-breakpoint
CREATE TABLE "contest_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_id" uuid NOT NULL,
	"polymarket_slug" text NOT NULL,
	"polymarket_condition_id" text NOT NULL,
	"event_title" text NOT NULL,
	"outcomes" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"resolved_outcome" text,
	"resolved_at" timestamp with time zone,
	"status" "event_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" "contest_category" DEFAULT 'sports' NOT NULL,
	"status" "contest_status" DEFAULT 'draft' NOT NULL,
	"entry_fee_usdc" numeric(12, 2) DEFAULT '5.00' NOT NULL,
	"rake_bps" integer DEFAULT 1000 NOT NULL,
	"min_entries" integer DEFAULT 2 NOT NULL,
	"max_entries" integer,
	"closes_at" timestamp with time zone,
	"vault_address" text,
	"total_entries" integer DEFAULT 0 NOT NULL,
	"total_pool_usdc" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"winner_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"picks" jsonb NOT NULL,
	"odds_snapshot" jsonb,
	"entry_tx_signature" text NOT NULL,
	"score" numeric(12, 6),
	"correct_count" integer,
	"payout_usdc" numeric(12, 2),
	"payout_tx_signature" text,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scored_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payouts_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contest_id" uuid NOT NULL,
	"wallet_address" text NOT NULL,
	"amount_usdc" numeric(12, 2) NOT NULL,
	"type" "payout_type" NOT NULL,
	"tx_signature" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contest_events" ADD CONSTRAINT "contest_events_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts_log" ADD CONSTRAINT "payouts_log_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contest_events_contest_sort_idx" ON "contest_events" USING btree ("contest_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "contest_events_contest_condition_unique" ON "contest_events" USING btree ("contest_id","polymarket_condition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entries_tx_signature_unique" ON "entries" USING btree ("entry_tx_signature");--> statement-breakpoint
CREATE INDEX "entries_contest_entered_at_idx" ON "entries" USING btree ("contest_id","entered_at");