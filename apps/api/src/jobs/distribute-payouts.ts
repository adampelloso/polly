/**
 * Distribute payouts job — sends USDC from vault PDA to winner + rake to treasury.
 */

import { type Job } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { getContest } from "../services/contest-manager";
import { distributeVaultPayouts } from "../services/vault-client";
import { aggregateWalletAmounts } from "../services/payout-utils";

export interface DistributePayoutsData {
  contestId: string;
  rakeAmount: number;
}

export async function processDistributePayouts(
  job: Job<DistributePayoutsData>
) {
  const { contestId, rakeAmount } = job.data;
  const onChainEnabled = process.env.ENABLE_ONCHAIN_PAYOUTS === "true";
  const existingPayoutLogs = await db.query.payoutsLog.findMany({
    where: and(
      eq(schema.payoutsLog.contestId, contestId),
      inArray(schema.payoutsLog.type, ["prize", "rake"])
    ),
  });

  const hasFinalizedPayoutLogs = existingPayoutLogs.some(
    (log) => log.txSignature !== "pending"
  );
  if (hasFinalizedPayoutLogs) {
    return;
  }

  const contest = await getContest(contestId);
  if (!contest || contest.status !== "resolved") return;
  const vaultAddress = contest.vaultAddress;
  if (!vaultAddress && onChainEnabled) {
    throw new Error("Contest has no vault address for payout distribution");
  }
  if (!vaultAddress && !onChainEnabled) return;

  // Get winner entry
  const entries = await db.query.entries.findMany({
    where: eq(schema.entries.contestId, contestId),
  });

  const winners = entries.filter(
    (e) => e.payoutUsdc && parseFloat(e.payoutUsdc) > 0
  );

  const treasuryWallet = process.env.TREASURY_WALLET;
  if (rakeAmount > 0 && !treasuryWallet) {
    throw new Error("TREASURY_WALLET is required when rake is non-zero");
  }

  const aggregatedWinnerPayouts = aggregateWalletAmounts(
    winners.map((winner) => ({
      wallet: winner.walletAddress,
      amountUsdc: parseFloat(winner.payoutUsdc!),
    }))
  );

  const payoutPayload = [
    ...aggregatedWinnerPayouts.map((winner) => ({
      wallet: winner.wallet,
      amountUsdc: winner.amountUsdc,
      type: "prize" as const,
    })),
    ...(rakeAmount > 0 && treasuryWallet
      ? [
          {
            wallet: treasuryWallet,
            amountUsdc: rakeAmount,
            type: "rake" as const,
          },
        ]
      : []),
  ];

  if (!onChainEnabled && existingPayoutLogs.length > 0) {
    return;
  }
  if (payoutPayload.length === 0) {
    return;
  }

  let txSignature = "pending";
  if (onChainEnabled) {
    if (!vaultAddress) {
      throw new Error("Contest has no vault address for payout distribution");
    }
    txSignature = await distributeVaultPayouts({
      contestId,
      vaultAddress,
      payouts: payoutPayload.map((p) => ({
        wallet: p.wallet,
        amountUsdc: p.amountUsdc,
      })),
    });
  }

  if (existingPayoutLogs.length > 0 && onChainEnabled && txSignature !== "pending") {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.payoutsLog)
        .set({ txSignature })
        .where(
          and(
            eq(schema.payoutsLog.contestId, contestId),
            inArray(schema.payoutsLog.type, ["prize", "rake"]),
            eq(schema.payoutsLog.txSignature, "pending")
          )
        );
    });
  } else {
    await db.transaction(async (tx) => {
      for (const payout of payoutPayload) {
        await tx.insert(schema.payoutsLog).values({
          contestId,
          walletAddress: payout.wallet,
          amountUsdc: String(payout.amountUsdc),
          type: payout.type,
          txSignature,
        });
      }
    });
  }

  if (txSignature !== "pending") {
    await db.transaction(async (tx) => {
      for (const winner of winners) {
        await tx
          .update(schema.entries)
          .set({ payoutTxSignature: txSignature })
          .where(eq(schema.entries.id, winner.id));
      }
    });
  }
}
