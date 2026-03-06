/**
 * Job workers — start all BullMQ workers.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import {
  shouldScheduleDistribution,
  shouldScheduleRefund,
} from "../services/settlement-reconcile";
import {
  createWorker,
  scheduleContestClose,
  scheduleContestDistribution,
  scheduleResolutionPolling,
  scheduleContestRefund,
} from "./queue";
import { processCloseContest, type CloseContestData } from "./lock-contest";
import {
  processPollResolution,
  type PollResolutionData,
} from "./poll-resolution";
import {
  processComputePayouts,
  type ComputePayoutsData,
} from "./compute-payouts";
import {
  processDistributePayouts,
  type DistributePayoutsData,
} from "./distribute-payouts";
import {
  processRefundContest,
  type RefundContestData,
} from "./refund-contest";

async function reconcileSchedules() {
  const active = await db.query.contests.findMany({
    where: eq(schema.contests.status, "active"),
  });
  for (const contest of active) {
    if (!contest.closesAt) continue;
    await scheduleContestClose(contest.id, contest.closesAt);
  }

  const closed = await db.query.contests.findMany({
    where: eq(schema.contests.status, "closed"),
  });
  for (const contest of closed) {
    await scheduleResolutionPolling(contest.id);
  }

  const voided = await db.query.contests.findMany({
    where: eq(schema.contests.status, "voided"),
  });
  for (const contest of voided) {
    const payoutLogs = await db.query.payoutsLog.findMany({
      where: eq(schema.payoutsLog.contestId, contest.id),
    });
    if (shouldScheduleRefund({ contest, payoutLogs })) {
      await scheduleContestRefund(contest.id);
    }
  }

  const resolved = await db.query.contests.findMany({
    where: eq(schema.contests.status, "resolved"),
  });
  for (const contest of resolved) {
    const payoutLogs = await db.query.payoutsLog.findMany({
      where: eq(schema.payoutsLog.contestId, contest.id),
    });
    const entries = await db.query.entries.findMany({
      where: eq(schema.entries.contestId, contest.id),
    });
    const decision = shouldScheduleDistribution({
      contest,
      entries,
      payoutLogs,
    });
    if (decision.shouldSchedule) {
      await scheduleContestDistribution(contest.id, decision.rakeAmount);
    }
  }
}

export function startWorkers() {
  const workers = [
    createWorker<CloseContestData>("close-contest", processCloseContest),
    createWorker<PollResolutionData>("poll-resolution", processPollResolution),
    createWorker<ComputePayoutsData>("compute-payouts", processComputePayouts),
    createWorker<DistributePayoutsData>(
      "distribute-payouts",
      processDistributePayouts
    ),
    createWorker<RefundContestData>("refund-contest", processRefundContest),
  ];

  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      console.error(
        `[queue:${worker.name}] job failed`,
        { jobId: job?.id, name: job?.name, data: job?.data },
        err
      );
    });
    worker.on("completed", (job) => {
      console.log(`[queue:${worker.name}] job completed`, {
        jobId: job.id,
        name: job.name,
      });
    });
  }

  console.log(`Started ${workers.length} job workers`);
  void reconcileSchedules().catch((err) => {
    console.error("Failed to reconcile contest schedules:", err);
  });
  return workers;
}
