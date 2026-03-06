import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";

// USDC mint on Solana mainnet
const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ??
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
  "https://api.mainnet-beta.solana.com";

export function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

/**
 * Build a USDC SPL token transfer instruction.
 */
export function buildUsdcTransferInstruction(
  senderPubkey: PublicKey,
  vaultPubkey: PublicKey,
  amountLamports: bigint
) {
  const senderAta = getAssociatedTokenAddressSync(
    USDC_MINT,
    senderPubkey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const vaultAta = getAssociatedTokenAddressSync(
    USDC_MINT,
    vaultPubkey,
    true, // allow PDA owner
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  return createTransferInstruction(
    senderAta,
    vaultAta,
    senderPubkey,
    amountLamports,
    [],
    TOKEN_PROGRAM_ID
  );
}

/**
 * Build and sign a USDC transfer transaction via Privy wallet.
 * Returns the transaction signature.
 */
export async function sendUsdcTransfer(
  wallet: { address: string; signTransaction: (tx: Transaction) => Promise<Transaction> },
  vaultAddress: string,
  amountUsdc: number
): Promise<string> {
  const connection = getConnection();
  const senderPubkey = new PublicKey(wallet.address);
  const vaultPubkey = new PublicKey(vaultAddress);

  // USDC has 6 decimals
  const amountLamports = BigInt(Math.round(amountUsdc * 1_000_000));

  const ix = buildUsdcTransferInstruction(
    senderPubkey,
    vaultPubkey,
    amountLamports
  );

  const tx = new Transaction().add(ix);
  tx.feePayer = senderPubkey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  const signedTx = await wallet.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signedTx.serialize());
  await connection.confirmTransaction(signature, "confirmed");

  return signature;
}

/**
 * Get USDC balance for a wallet address.
 */
export async function getUsdcBalance(walletAddress: string): Promise<number> {
  const connection = getConnection();
  const pubkey = new PublicKey(walletAddress);
  const ata = getAssociatedTokenAddressSync(USDC_MINT, pubkey);

  try {
    const account = await getAccount(connection, ata);
    return Number(account.amount) / 1_000_000;
  } catch {
    return 0;
  }
}
