import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await connection.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

export function createQueue(name: string) {
  return new Queue(name, { connection });
}

export function createWorker<T>(
  name: string,
  processor: (job: Job<T>) => Promise<void>
) {
  return new Worker<T>(name, processor, { connection });
}

// ── Queue instances ──

export const closeQueue = createQueue("close-contest");
export const resolutionQueue = createQueue("poll-resolution");
export const payoutQueue = createQueue("compute-payouts");
export const distributeQueue = createQueue("distribute-payouts");
export const refundQueue = createQueue("refund-contest");

export async function scheduleContestClose(contestId: string, closesAt: Date) {
  const delayMs = Math.max(0, closesAt.getTime() - Date.now());
  try {
    await closeQueue.add(
      `close-${contestId}`,
      { contestId },
      {
        delay: delayMs,
        jobId: `close-${contestId}`,
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!msg.includes("Job is already waiting") && !msg.includes("already exists")) {
      throw err;
    }
  }
}

export async function cancelContestClose(contestId: string) {
  try {
    await closeQueue.remove(`close-${contestId}`);
  } catch {
    // noop when job does not exist
  }
}

export async function scheduleResolutionPolling(contestId: string) {
  try {
    await resolutionQueue.add(
      `poll-${contestId}`,
      { contestId },
      {
        repeat: { every: 60_000 },
        jobId: `resolution-${contestId}`,
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!msg.includes("Job is already waiting") && !msg.includes("already exists")) {
      throw err;
    }
  }
}

export async function cancelResolutionPolling(contestId: string) {
  try {
    await resolutionQueue.removeRepeatable(
      `poll-${contestId}`,
      { every: 60_000 },
      `resolution-${contestId}`
    );
  } catch {
    // noop when repeatable job does not exist
  }
}

export async function scheduleContestRefund(contestId: string) {
  try {
    await refundQueue.add(
      `refund-${contestId}`,
      { contestId },
      {
        jobId: `refund-${contestId}`,
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!msg.includes("Job is already waiting") && !msg.includes("already exists")) {
      throw err;
    }
  }
}

export async function scheduleContestDistribution(
  contestId: string,
  rakeAmount: number
) {
  try {
    await distributeQueue.add(
      `distribute-${contestId}`,
      { contestId, rakeAmount },
      {
        jobId: `distribute-${contestId}`,
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!msg.includes("Job is already waiting") && !msg.includes("already exists")) {
      throw err;
    }
  }
}

export async function getQueueStats() {
  const queues = [
    closeQueue,
    resolutionQueue,
    payoutQueue,
    distributeQueue,
    refundQueue,
  ];

  const stats: Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> = await Promise.all(
    queues.map(async (queue) => {
      const counts = await queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed"
      );
      return {
        name: queue.name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
    })
  );

  const alerts = stats.flatMap((q) => {
    const out: Array<{ queue: string; level: "warning" | "critical"; message: string }> = [];
    if (q.failed > 0) {
      out.push({
        queue: q.name,
        level: "critical",
        message: `${q.failed} failed jobs`,
      });
    }
    if (q.waiting + q.delayed > 250) {
      out.push({
        queue: q.name,
        level: "warning",
        message: `high backlog (${q.waiting} waiting, ${q.delayed} delayed)`,
      });
    }
    return out;
  });

  return { stats, alerts };
}
