import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, getAccount } from "@solana/spl-token";
import { USDC_MINT } from "@polypool/shared";

const USDC_DECIMALS = 6;

function toBaseUnits(amountUsdc: number): bigint {
  return BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));
}

function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

function extractTransferAmount(parsed: Record<string, unknown>): bigint {
  if (parsed.type === "transferChecked") {
    const info = parsed.info as Record<string, unknown>;
    const tokenAmount = info.tokenAmount as Record<string, unknown> | undefined;
    const amount = tokenAmount?.amount;
    if (typeof amount === "string") return BigInt(amount);
  }

  if (parsed.type === "transfer") {
    const info = parsed.info as Record<string, unknown>;
    const amount = info.amount;
    if (typeof amount === "string") return BigInt(amount);
  }

  return 0n;
}

export async function verifyEntryPayment(input: {
  txSignature: string;
  walletAddress: string;
  vaultAddress: string;
  amountUsdc: number;
}) {
  if (process.env.SKIP_PAYMENT_VERIFICATION === "true") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SKIP_PAYMENT_VERIFICATION cannot be enabled in production");
    }
    return;
  }

  const rpcUrl =
    process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "finalized");

  const walletPubkey = new PublicKey(input.walletAddress);
  const vaultPubkey = new PublicKey(input.vaultAddress);
  const usdcMint = new PublicKey(process.env.USDC_MINT ?? USDC_MINT);
  const expectedAmount = toBaseUnits(input.amountUsdc);

  const vaultAta = getAssociatedTokenAddressSync(
    usdcMint,
    vaultPubkey,
    true
  ).toBase58();

  const tx = await connection.getParsedTransaction(input.txSignature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    throw new Error("Payment transaction not found on chain");
  }
  if (tx.meta?.err) {
    throw new Error("Payment transaction failed on chain");
  }

  const hasSigner = tx.transaction.message.accountKeys.some((acct) => {
    const key =
      typeof acct === "string"
        ? acct
        : acct.pubkey?.toBase58?.() ?? String(acct.pubkey);
    const signer = typeof acct === "string" ? false : Boolean(acct.signer);
    return signer && normalizeAddress(key) === normalizeAddress(walletPubkey.toBase58());
  });

  if (!hasSigner) {
    throw new Error("Payment transaction signer does not match wallet");
  }

  const allInstructions: Array<Record<string, unknown>> = [
    ...(tx.transaction.message.instructions as Array<Record<string, unknown>>),
    ...((tx.meta?.innerInstructions ?? []).flatMap((inner) =>
      (inner.instructions as Array<Record<string, unknown>>) ?? []
    ) as Array<Record<string, unknown>>),
  ];

  const matchingTransfer = allInstructions.find((ix) => {
    const program = ix.program;
    const parsed = ix.parsed as Record<string, unknown> | undefined;
    const info = parsed?.info as Record<string, unknown> | undefined;

    if ((program !== "spl-token" && program !== "spl-token-2022") || !parsed || !info) {
      return false;
    }

    const destination = info.destination;
    const authority = info.authority;
    if (typeof destination !== "string" || typeof authority !== "string") {
      return false;
    }

    if (normalizeAddress(destination) !== normalizeAddress(vaultAta)) {
      return false;
    }
    if (normalizeAddress(authority) !== normalizeAddress(walletPubkey.toBase58())) {
      return false;
    }

    const amount = extractTransferAmount(parsed);
    return amount === expectedAmount;
  });

  if (!matchingTransfer) {
    throw new Error("No matching USDC transfer to contest vault found in transaction");
  }

  const vaultTokenAccount = await getAccount(connection, new PublicKey(vaultAta));
  if (!vaultTokenAccount.mint.equals(usdcMint)) {
    throw new Error("Vault token account is not USDC");
  }
  if (!vaultTokenAccount.owner.equals(vaultPubkey)) {
    throw new Error("Vault token account owner mismatch");
  }
}
