import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { USDC_MINT } from "@polypool/shared";

const DEFAULT_PROGRAM_ID = "JAswU7ZVvS72MBLdqM5koucR93ZKWu1BNRNNYDLYgrbN";
const USDC_DECIMALS = 6;

export interface VaultPayout {
  wallet: string;
  amountUsdc: number;
}

function encodeU64(value: bigint): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(value, 0);
  return out;
}

function toBaseUnits(amountUsdc: number): bigint {
  return BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS));
}

function readKeypair(): Keypair {
  const keypairPath =
    process.env.SOLANA_AUTHORITY_KEYPAIR_PATH ??
    path.join(process.env.HOME ?? "", ".config/solana/id.json");
  const raw = fs.readFileSync(keypairPath, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function discriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function encodeString(value: string): Buffer {
  const str = Buffer.from(value, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(str.length, 0);
  return Buffer.concat([len, str]);
}

function encodePayouts(payouts: Array<{ wallet: PublicKey; amount: bigint }>): Buffer {
  const out = Buffer.alloc(4 + payouts.length * (32 + 8));
  out.writeUInt32LE(payouts.length, 0);
  let offset = 4;
  for (const payout of payouts) {
    payout.wallet.toBuffer().copy(out, offset);
    offset += 32;
    out.writeBigUInt64LE(payout.amount, offset);
    offset += 8;
  }
  return out;
}

function encodePubkeys(wallets: PublicKey[]): Buffer {
  const out = Buffer.alloc(4 + wallets.length * 32);
  out.writeUInt32LE(wallets.length, 0);
  let offset = 4;
  for (const wallet of wallets) {
    wallet.toBuffer().copy(out, offset);
    offset += 32;
  }
  return out;
}

function contestSeed(contestId: string): Buffer {
  // PDA seed chunks are max 32 bytes; UUID contest ids are longer.
  return createHash("sha256").update(contestId).digest().subarray(0, 32);
}

function deriveContestAndVaultPdas(programId: PublicKey, contestId: string) {
  const seed = contestSeed(contestId);
  const [contestPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("contest"), seed],
    programId
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), seed],
    programId
  );
  return { contestPda, vaultPda };
}

export async function distributeVaultPayouts(input: {
  contestId: string;
  vaultAddress: string;
  payouts: VaultPayout[];
}) {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const programId = new PublicKey(process.env.POLYPOOL_PROGRAM_ID ?? DEFAULT_PROGRAM_ID);
  const usdcMint = new PublicKey(process.env.USDC_MINT ?? USDC_MINT);
  const authority = readKeypair();
  const connection = new Connection(rpcUrl, "confirmed");

  const { contestPda, vaultPda } = deriveContestAndVaultPdas(programId, input.contestId);

  if (vaultPda.toBase58() !== input.vaultAddress) {
    throw new Error("Contest vault does not match program-derived vault PDA");
  }

  const payouts = input.payouts
    .filter((p) => p.amountUsdc > 0)
    .map((p) => ({
      wallet: new PublicKey(p.wallet),
      amount: toBaseUnits(p.amountUsdc),
    }));

  if (payouts.length === 0) {
    throw new Error("No payouts to distribute");
  }

  const recipientAtas = payouts.map((p) =>
    getAssociatedTokenAddressSync(
      usdcMint,
      p.wallet,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  const instructions: TransactionInstruction[] = [];

  for (let i = 0; i < recipientAtas.length; i++) {
    const ata = recipientAtas[i];
    const owner = payouts[i].wallet;
    const info = await connection.getAccountInfo(ata, "confirmed");
    if (!info) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          authority.publicKey,
          ata,
          owner,
          usdcMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }
  }

  const data = Buffer.concat([
    discriminator("distribute_payouts"),
    encodeString(input.contestId),
    encodePayouts(payouts),
  ]);

  const distributeIx = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: contestPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ...recipientAtas.map((ata) => ({
        pubkey: ata,
        isSigner: false,
        isWritable: true,
      })),
    ],
    data,
  });

  instructions.push(distributeIx);

  const tx = new Transaction().add(...instructions);
  const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
    commitment: "confirmed",
  });

  return signature;
}

export async function initializeVaultContest(input: {
  contestId: string;
  entryFeeUsdc: number;
}) {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const programId = new PublicKey(process.env.POLYPOOL_PROGRAM_ID ?? DEFAULT_PROGRAM_ID);
  const usdcMint = new PublicKey(process.env.USDC_MINT ?? USDC_MINT);
  const authority = readKeypair();
  const connection = new Connection(rpcUrl, "confirmed");

  const { contestPda, vaultPda } = deriveContestAndVaultPdas(programId, input.contestId);

  const [contestInfo, vaultInfo] = await Promise.all([
    connection.getAccountInfo(contestPda, "confirmed"),
    connection.getAccountInfo(vaultPda, "confirmed"),
  ]);
  if (contestInfo && vaultInfo) {
    return {
      contestAddress: contestPda.toBase58(),
      vaultAddress: vaultPda.toBase58(),
      signature: null as string | null,
    };
  }

  const data = Buffer.concat([
    discriminator("initialize_contest"),
    encodeString(input.contestId),
    encodeU64(toBaseUnits(input.entryFeeUsdc)),
  ]);

  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: contestPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
    commitment: "confirmed",
  });

  return {
    contestAddress: contestPda.toBase58(),
    vaultAddress: vaultPda.toBase58(),
    signature,
  };
}

export async function refundVaultContest(input: {
  contestId: string;
  vaultAddress: string;
  wallets: string[];
}) {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const programId = new PublicKey(process.env.POLYPOOL_PROGRAM_ID ?? DEFAULT_PROGRAM_ID);
  const usdcMint = new PublicKey(process.env.USDC_MINT ?? USDC_MINT);
  const authority = readKeypair();
  const connection = new Connection(rpcUrl, "confirmed");

  const { contestPda, vaultPda } = deriveContestAndVaultPdas(programId, input.contestId);

  if (vaultPda.toBase58() !== input.vaultAddress) {
    throw new Error("Contest vault does not match program-derived vault PDA");
  }

  const refundWallets = input.wallets.map((w) => new PublicKey(w));
  if (refundWallets.length === 0) {
    throw new Error("No wallets to refund");
  }

  const uniqueWallets = Array.from(
    new Map(refundWallets.map((wallet) => [wallet.toBase58(), wallet])).values()
  );

  const recipientAtas = uniqueWallets.map((wallet) =>
    getAssociatedTokenAddressSync(
      usdcMint,
      wallet,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );

  const instructions: TransactionInstruction[] = [];
  for (let i = 0; i < recipientAtas.length; i++) {
    const ata = recipientAtas[i];
    const owner = uniqueWallets[i];
    const info = await connection.getAccountInfo(ata, "confirmed");
    if (!info) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          authority.publicKey,
          ata,
          owner,
          usdcMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }
  }

  const data = Buffer.concat([
    discriminator("refund_contest"),
    encodeString(input.contestId),
    encodePubkeys(refundWallets),
  ]);

  const refundIx = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: contestPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ...recipientAtas.map((ata) => ({
        pubkey: ata,
        isSigner: false,
        isWritable: true,
      })),
    ],
    data,
  });

  instructions.push(refundIx);

  const tx = new Transaction().add(...instructions);
  const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
    commitment: "confirmed",
  });

  return signature;
}
