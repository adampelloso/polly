import { calculateRakeAmount } from "./payout-utils";

export interface ReconcileContest {
  status: string;
  totalPoolUsdc: string;
  rakeBps: number;
}

export interface ReconcileEntry {
  payoutUsdc: string | null;
}

export interface ReconcilePayoutLog {
  type: "prize" | "rake" | "refund";
  txSignature: string;
}

export function hasFinalizedPayout(
  logs: ReconcilePayoutLog[],
  types: Array<ReconcilePayoutLog["type"]>
): boolean {
  return logs.some(
    (log) => types.includes(log.type) && log.txSignature !== "pending"
  );
}

export function shouldScheduleDistribution(input: {
  contest: ReconcileContest;
  entries: ReconcileEntry[];
  payoutLogs: ReconcilePayoutLog[];
}): { shouldSchedule: boolean; rakeAmount: number } {
  const { contest, entries, payoutLogs } = input;
  const alreadyPaid = hasFinalizedPayout(payoutLogs, ["prize", "rake"]);
  if (alreadyPaid) {
    return { shouldSchedule: false, rakeAmount: 0 };
  }

  const hasWinner = entries.some(
    (entry) => entry.payoutUsdc && parseFloat(entry.payoutUsdc) > 0
  );
  if (!hasWinner) {
    return { shouldSchedule: false, rakeAmount: 0 };
  }

  return {
    shouldSchedule: true,
    rakeAmount: calculateRakeAmount(
      parseFloat(contest.totalPoolUsdc),
      contest.rakeBps
    ),
  };
}

export function shouldScheduleRefund(input: {
  contest: ReconcileContest;
  payoutLogs: ReconcilePayoutLog[];
}): boolean {
  if (input.contest.status !== "voided") return false;
  return !hasFinalizedPayout(input.payoutLogs, ["refund"]);
}
