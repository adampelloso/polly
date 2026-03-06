import { and, eq } from "drizzle-orm";
import { type Job } from "bullmq";
import { db, schema } from "../db";
import { getContest } from "../services/contest-manager";
import { refundVaultContest } from "../services/vault-client";

export interface RefundContestData {
  contestId: string;
}

export async function processRefundContest(job: Job<RefundContestData>) {
  const { contestId } = job.data;

  const existingRefundLogs = await db.query.payoutsLog.findMany({
    where: and(
      eq(schema.payoutsLog.contestId, contestId),
      eq(schema.payoutsLog.type, "refund")
    ),
  });

  const hasFinalizedRefundLogs = existingRefundLogs.some(
    (log) => log.txSignature !== "pending"
  );
  if (hasFinalizedRefundLogs) {
    return;
  }

  const contest = await getContest(contestId);
  if (!contest || contest.status !== "voided") return;

  const entries = await db.query.entries.findMany({
    where: eq(schema.entries.contestId, contestId),
  });
  if (entries.length === 0) {
    return;
  }

  const entryFee = parseFloat(contest.entryFeeUsdc);
  const onChainEnabled = process.env.ENABLE_ONCHAIN_PAYOUTS === "true";
  if (!onChainEnabled && existingRefundLogs.length > 0) {
    return;
  }

  let txSignature = "pending";
  if (onChainEnabled) {
    if (!contest.vaultAddress) {
      throw new Error("Contest has no vault address for refund distribution");
    }
    txSignature = await refundVaultContest({
      contestId,
      vaultAddress: contest.vaultAddress,
      wallets: entries.map((entry) => entry.walletAddress),
    });
  }

  if (existingRefundLogs.length > 0 && onChainEnabled && txSignature !== "pending") {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.payoutsLog)
        .set({ txSignature })
        .where(
          and(
            eq(schema.payoutsLog.contestId, contestId),
            eq(schema.payoutsLog.type, "refund"),
            eq(schema.payoutsLog.txSignature, "pending")
          )
        );
    });
  } else if (existingRefundLogs.length === 0) {
    await db.transaction(async (tx) => {
      for (const entry of entries) {
        await tx.insert(schema.payoutsLog).values({
          contestId,
          walletAddress: entry.walletAddress,
          amountUsdc: String(entryFee),
          type: "refund",
          txSignature,
        });
      }
    });
  }

  if (txSignature !== "pending") {
    await db.transaction(async (tx) => {
      for (const entry of entries) {
        await tx
          .update(schema.entries)
          .set({ payoutTxSignature: txSignature })
          .where(eq(schema.entries.id, entry.id));
      }
    });
  }
}
