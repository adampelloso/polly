"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getUsdcBalance, getConnection } from "@/lib/solana";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ??
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

export default function AccountPage() {
  const { ready, authenticated, login, wallet, walletAddress } = useAuth();
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawResult, setWithdrawResult] = useState("");

  useEffect(() => {
    if (walletAddress) {
      getUsdcBalance(walletAddress).then(setUsdcBalance).catch(() => setUsdcBalance(0));
    }
  }, [walletAddress]);

  const handleWithdraw = async () => {
    if (!wallet || !walletAddress || !withdrawAddr || !withdrawAmount) return;

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) return;

    setWithdrawing(true);
    setWithdrawResult("");

    try {
      const connection = getConnection();
      const senderPubkey = new PublicKey(walletAddress);
      const destPubkey = new PublicKey(withdrawAddr);
      const amountLamports = BigInt(Math.round(amount * 1_000_000));

      const senderAta = getAssociatedTokenAddressSync(USDC_MINT, senderPubkey);
      const destAta = getAssociatedTokenAddressSync(USDC_MINT, destPubkey);

      const ix = createTransferInstruction(
        senderAta,
        destAta,
        senderPubkey,
        amountLamports,
        [],
        TOKEN_PROGRAM_ID
      );

      const tx = new Transaction().add(ix);
      tx.feePayer = senderPubkey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signedTx = await (wallet as any).signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      setWithdrawResult(`Sent! Tx: ${sig.slice(0, 8)}...`);
      setWithdrawAddr("");
      setWithdrawAmount("");
      // Refresh balance
      getUsdcBalance(walletAddress).then(setUsdcBalance).catch(() => {});
    } catch (err) {
      setWithdrawResult(
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setWithdrawing(false);
    }
  };

  if (!ready) {
    return (
      <div className="h-6 w-48 animate-pulse bg-neutral-100" />
    );
  }

  if (!authenticated) {
    return (
      <div className="py-8 text-center">
        <h1 className="text-xl font-extrabold uppercase tracking-tight text-black">
          Account
        </h1>
        <p className="mt-3 font-mono text-sm text-neutral-400">
          Connect your wallet to view your account.
        </p>
        <button
          onClick={login}
          className="mt-6 border border-black bg-black px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-xl font-extrabold uppercase tracking-tight text-black">
        Account
      </h1>

        {/* Wallet info */}
        <div className="mt-6 border border-neutral-200 p-5">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            Wallet
          </h2>
          {walletAddress && (
            <p className="mt-2 break-all font-mono text-sm text-black">
              {walletAddress}
            </p>
          )}
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400">
              USDC Balance
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-black">
              {usdcBalance !== null
                ? `$${usdcBalance.toFixed(2)}`
                : "Loading..."}
            </p>
          </div>
        </div>

        {/* Withdraw */}
        <div className="mt-4 border border-neutral-200 p-5">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            Withdraw USDC
          </h2>
          <p className="mt-1 font-mono text-[10px] text-neutral-300">
            Send USDC from your embedded wallet to another address.
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Destination Address
              </label>
              <input
                type="text"
                value={withdrawAddr}
                onChange={(e) => setWithdrawAddr(e.target.value)}
                placeholder="Solana address..."
                className="mt-1 w-full border border-neutral-300 bg-white px-4 py-2.5 font-mono text-sm text-black placeholder-neutral-400 outline-none focus:border-black"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Amount (USDC)
              </label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                min={0}
                step={0.01}
                className="mt-1 w-full border border-neutral-300 bg-white px-4 py-2.5 font-mono text-sm text-black placeholder-neutral-400 outline-none focus:border-black"
              />
            </div>
            <button
              onClick={handleWithdraw}
              disabled={withdrawing || !withdrawAddr || !withdrawAmount}
              className="border border-black bg-black px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {withdrawing ? "Sending..." : "Send USDC"}
            </button>
            {withdrawResult && (
              <p
                className={`font-mono text-xs ${
                  withdrawResult.startsWith("Sent")
                    ? "text-win"
                    : "text-loss"
                }`}
              >
                {withdrawResult}
              </p>
            )}
          </div>
        </div>

        {/* Entry history placeholder */}
        <div className="mt-4 border border-neutral-200 p-5">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            Entry History
          </h2>
          <p className="mt-3 font-mono text-sm text-neutral-300">
            Your past contest entries will appear here.
          </p>
        </div>
    </>
  );
}
