import { afterEach, describe, expect, it } from "vitest";
import { verifyEntryPayment } from "../services/payment-verifier";

const originalNodeEnv = process.env.NODE_ENV;
const originalSkip = process.env.SKIP_PAYMENT_VERIFICATION;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.SKIP_PAYMENT_VERIFICATION = originalSkip;
});

describe("verifyEntryPayment", () => {
  it("allows explicit skip in non-production", async () => {
    process.env.NODE_ENV = "development";
    process.env.SKIP_PAYMENT_VERIFICATION = "true";

    await expect(
      verifyEntryPayment({
        txSignature: "test",
        walletAddress: "11111111111111111111111111111111",
        vaultAddress: "11111111111111111111111111111111",
        amountUsdc: 1,
      })
    ).resolves.toBeUndefined();
  });

  it("rejects skip mode in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.SKIP_PAYMENT_VERIFICATION = "true";

    await expect(
      verifyEntryPayment({
        txSignature: "test",
        walletAddress: "11111111111111111111111111111111",
        vaultAddress: "11111111111111111111111111111111",
        amountUsdc: 1,
      })
    ).rejects.toThrow("SKIP_PAYMENT_VERIFICATION cannot be enabled in production");
  });
});
