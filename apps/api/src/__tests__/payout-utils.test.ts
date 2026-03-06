import { describe, expect, it } from "vitest";
import { aggregateWalletAmounts, calculateRakeAmount } from "../services/payout-utils";

describe("aggregateWalletAmounts", () => {
  it("sums duplicate wallet payouts", () => {
    const result = aggregateWalletAmounts([
      { wallet: "w1", amountUsdc: 10 },
      { wallet: "w2", amountUsdc: 5.25 },
      { wallet: "w1", amountUsdc: 2.5 },
    ]);

    expect(result).toEqual([
      { wallet: "w1", amountUsdc: 12.5 },
      { wallet: "w2", amountUsdc: 5.25 },
    ]);
  });

  it("drops invalid payouts", () => {
    const result = aggregateWalletAmounts([
      { wallet: " ", amountUsdc: 1 },
      { wallet: "w1", amountUsdc: 0 },
      { wallet: "w2", amountUsdc: -3 },
      { wallet: "w3", amountUsdc: 2 },
    ]);

    expect(result).toEqual([{ wallet: "w3", amountUsdc: 2 }]);
  });
});

describe("calculateRakeAmount", () => {
  it("calculates and rounds rake in cents", () => {
    expect(calculateRakeAmount(123.45, 1250)).toBe(15.43);
  });
});
