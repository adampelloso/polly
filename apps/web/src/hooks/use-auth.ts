"use client";

import { usePrivy, useSolanaWallets } from "@privy-io/react-auth";

export function useAuth() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useSolanaWallets();
  const wallet = wallets[0] ?? null;

  const xHandle = user?.twitter?.username ?? null;

  return {
    ready,
    authenticated,
    login,
    logout,
    user,
    wallet,
    walletAddress: wallet?.address ?? null,
    xHandle,
  };
}
