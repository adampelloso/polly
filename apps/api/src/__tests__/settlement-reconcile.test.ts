import { describe, expect, it } from "vitest";
import {
  hasFinalizedPayout,
  shouldScheduleDistribution,
  shouldScheduleRefund,
} from "../services/settlement-reconcile";

describe("hasFinalizedPayout", () => {
  it("detects finalized payout records", () => {
    expect(
      hasFinalizedPayout(
        [
          { type: "prize", txSignature: "pending" },
          { type: "rake", txSignature: "abc123" },
        ],
        ["prize", "rake"]
      )
    ).toBe(true);
  });
});

describe("shouldScheduleDistribution", () => {
  it("schedules when winner exists and no finalized payout", () => {
    const decision = shouldScheduleDistribution({
      contest: { status: "resolved", totalPoolUsdc: "100.00", rakeBps: 1000 },
      entries: [{ payoutUsdc: "90.00" }, { payoutUsdc: null }],
      payoutLogs: [],
    });

    expect(decision).toEqual({ shouldSchedule: true, rakeAmount: 10 });
  });

  it("does not schedule when payout already finalized", () => {
    const decision = shouldScheduleDistribution({
      contest: { status: "resolved", totalPoolUsdc: "100.00", rakeBps: 1000 },
      entries: [{ payoutUsdc: "90.00" }],
      payoutLogs: [{ type: "prize", txSignature: "tx123" }],
    });

    expect(decision.shouldSchedule).toBe(false);
  });
});

describe("shouldScheduleRefund", () => {
  it("schedules refund for voided contest without finalized refund", () => {
    const should = shouldScheduleRefund({
      contest: { status: "voided", totalPoolUsdc: "0.00", rakeBps: 0 },
      payoutLogs: [{ type: "refund", txSignature: "pending" }],
    });
    expect(should).toBe(true);
  });

  it("does not schedule refund when already finalized", () => {
    const should = shouldScheduleRefund({
      contest: { status: "voided", totalPoolUsdc: "0.00", rakeBps: 0 },
      payoutLogs: [{ type: "refund", txSignature: "tx-final" }],
    });
    expect(should).toBe(false);
  });
});
