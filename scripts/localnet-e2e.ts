/**
 * Localnet E2E test for the polypool-vault program.
 *
 * Tests: initialize_contest → enter_contest → distribute_payouts
 *
 * Prerequisites:
 *   - solana-test-validator running on localhost:8899
 *   - Program deployed at JAswU7ZVvS72MBLdqM5koucR93ZKWu1BNRNNYDLYgrbN
 *   - USDC_MINT set in env or defaults to the one created in setup
 *
 * Usage: USDC_MINT=<mint> npx tsx scripts/localnet-e2e.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";

const PROGRAM_ID = new PublicKey("JAswU7ZVvS72MBLdqM5koucR93ZKWu1BNRNNYDLYgrbN");
const CONNECTION = new Connection("http://localhost:8899", "confirmed");

// Load admin keypair from Solana CLI default
const adminKeypairPath = path.join(
  process.env.HOME!,
  ".config/solana/id.json"
);
const adminKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(adminKeypairPath, "utf-8")))
);

async function main() {
  console.log("=== Polly Vault Localnet E2E Test ===\n");
  console.log(`Admin: ${adminKeypair.publicKey.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);

  const balance = await CONNECTION.getBalance(adminKeypair.publicKey);
  console.log(`Admin balance: ${balance / 1e9} SOL\n`);

  // Step 1: Create USDC mint (or use existing)
  let usdcMint: PublicKey;
  if (process.env.USDC_MINT) {
    usdcMint = new PublicKey(process.env.USDC_MINT);
    console.log(`Using existing USDC mint: ${usdcMint.toBase58()}`);
  } else {
    console.log("Creating new USDC mint...");
    usdcMint = await createMint(
      CONNECTION,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      6
    );
    console.log(`USDC Mint: ${usdcMint.toBase58()}`);
  }

  // Step 2: Create user keypair and fund
  const user = Keypair.generate();
  console.log(`\nUser: ${user.publicKey.toBase58()}`);

  // Airdrop SOL to user for tx fees
  const airdropSig = await CONNECTION.requestAirdrop(user.publicKey, 1e9);
  await CONNECTION.confirmTransaction(airdropSig);
  console.log("Airdropped 1 SOL to user");

  // Create user USDC account and mint tokens
  const userTokenAccount = await createAccount(
    CONNECTION,
    adminKeypair,
    usdcMint,
    user.publicKey
  );
  console.log(`User token account: ${userTokenAccount.toBase58()}`);

  // Mint 100 USDC to user
  await mintTo(
    CONNECTION,
    adminKeypair,
    usdcMint,
    userTokenAccount,
    adminKeypair.publicKey,
    100_000_000 // 100 USDC
  );
  console.log("Minted 100 USDC to user");

  // Step 3: Initialize contest
  const contestId = "test-contest-001";
  const entryFee = 5_000_000; // 5 USDC

  const [contestPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("contest"), Buffer.from(contestId)],
    PROGRAM_ID
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(contestId)],
    PROGRAM_ID
  );

  console.log(`\n--- Initialize Contest ---`);
  console.log(`Contest PDA: ${contestPda.toBase58()}`);
  console.log(`Vault PDA: ${vaultPda.toBase58()}`);

  // Build initialize instruction manually using Anchor discriminator
  const initDiscriminator = anchor.utils.bytes.utf8.encode(
    "global:initialize_contest"
  );
  const initHash = Buffer.from(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("global:initialize_contest")
    )
  ).slice(0, 8);

  // Use Anchor IDL-less approach: construct the instruction data manually
  // Discriminator (8 bytes) + contest_id (4 bytes len + string) + entry_fee (8 bytes u64 LE)
  const contestIdBytes = Buffer.from(contestId, "utf-8");
  const initData = Buffer.alloc(8 + 4 + contestIdBytes.length + 8);
  initHash.copy(initData, 0);
  initData.writeUInt32LE(contestIdBytes.length, 8);
  contestIdBytes.copy(initData, 12);
  // entry_fee as u64 LE
  initData.writeBigUInt64LE(BigInt(entryFee), 12 + contestIdBytes.length);

  const initIx = new anchor.web3.TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: contestPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: initData,
  });

  const initTx = new Transaction().add(initIx);
  const initSig = await sendAndConfirmTransaction(CONNECTION, initTx, [
    adminKeypair,
  ]);
  console.log(`Initialize TX: ${initSig}`);

  // Verify vault created
  const vaultInfo = await getAccount(CONNECTION, vaultPda);
  console.log(`Vault balance: ${Number(vaultInfo.amount) / 1e6} USDC`);

  // Step 4: Enter contest (user)
  console.log(`\n--- Enter Contest ---`);

  const enterHash = Buffer.from(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("global:enter_contest")
    )
  ).slice(0, 8);

  const enterData = Buffer.alloc(8 + 4 + contestIdBytes.length);
  enterHash.copy(enterData, 0);
  enterData.writeUInt32LE(contestIdBytes.length, 8);
  contestIdBytes.copy(enterData, 12);

  const enterIx = new anchor.web3.TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user.publicKey, isSigner: true, isWritable: true },
      { pubkey: contestPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: enterData,
  });

  const enterTx = new Transaction().add(enterIx);
  const enterSig = await sendAndConfirmTransaction(CONNECTION, enterTx, [user]);
  console.log(`Enter TX: ${enterSig}`);

  // Check balances
  const vaultAfterEntry = await getAccount(CONNECTION, vaultPda);
  const userAfterEntry = await getAccount(CONNECTION, userTokenAccount);
  console.log(`Vault balance: ${Number(vaultAfterEntry.amount) / 1e6} USDC`);
  console.log(`User balance: ${Number(userAfterEntry.amount) / 1e6} USDC`);

  // Step 5: Distribute payout (admin pays winner)
  console.log(`\n--- Distribute Payouts ---`);

  // Create treasury token account
  const treasuryKeypair = Keypair.generate();
  const treasuryAirdrop = await CONNECTION.requestAirdrop(
    treasuryKeypair.publicKey,
    1e9
  );
  await CONNECTION.confirmTransaction(treasuryAirdrop);
  const treasuryTokenAccount = await createAccount(
    CONNECTION,
    adminKeypair,
    usdcMint,
    treasuryKeypair.publicKey
  );

  // Build distribute instruction
  const distributeHash = Buffer.from(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("global:distribute_payouts")
    )
  ).slice(0, 8);

  // Payouts: winner gets 4.5 USDC, treasury gets 0.5 USDC (10% rake)
  const winnerAmount = 4_500_000n;
  const rakeAmount = 500_000n;

  // Encode payouts vec: 4 bytes len + (32 bytes pubkey + 8 bytes amount) * N
  const payoutsData = Buffer.alloc(4 + 2 * (32 + 8));
  payoutsData.writeUInt32LE(2, 0); // 2 payouts
  // Payout 1: winner (user)
  user.publicKey.toBuffer().copy(payoutsData, 4);
  payoutsData.writeBigUInt64LE(winnerAmount, 4 + 32);
  // Payout 2: treasury
  treasuryKeypair.publicKey.toBuffer().copy(payoutsData, 4 + 40);
  payoutsData.writeBigUInt64LE(rakeAmount, 4 + 40 + 32);

  const distData = Buffer.concat([
    distributeHash,
    Buffer.from(
      (() => {
        const b = Buffer.alloc(4 + contestIdBytes.length);
        b.writeUInt32LE(contestIdBytes.length, 0);
        contestIdBytes.copy(b, 4);
        return b;
      })()
    ),
    payoutsData,
  ]);

  const distIx = new anchor.web3.TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: contestPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: distData,
  });
  // Add remaining accounts for payout recipients
  distIx.keys.push(
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true }
  );

  const distTx = new Transaction().add(distIx);
  const distSig = await sendAndConfirmTransaction(CONNECTION, distTx, [
    adminKeypair,
  ]);
  console.log(`Distribute TX: ${distSig}`);

  // Final balances
  const vaultFinal = await getAccount(CONNECTION, vaultPda);
  const userFinal = await getAccount(CONNECTION, userTokenAccount);
  const treasuryFinal = await getAccount(CONNECTION, treasuryTokenAccount);
  console.log(`\n--- Final Balances ---`);
  console.log(`Vault: ${Number(vaultFinal.amount) / 1e6} USDC`);
  console.log(`User: ${Number(userFinal.amount) / 1e6} USDC`);
  console.log(`Treasury: ${Number(treasuryFinal.amount) / 1e6} USDC`);

  console.log("\n=== E2E Test Complete! ===");
}

main().catch((err) => {
  console.error("E2E test failed:", err);
  process.exit(1);
});
