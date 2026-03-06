export interface WalletAmount {
  wallet: string;
  amountUsdc: number;
}

export function aggregateWalletAmounts(items: WalletAmount[]): WalletAmount[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const wallet = item.wallet.trim();
    if (!wallet || item.amountUsdc <= 0) continue;
    totals.set(wallet, (totals.get(wallet) ?? 0) + item.amountUsdc);
  }
  return Array.from(totals.entries()).map(([wallet, amountUsdc]) => ({
    wallet,
    amountUsdc: Math.round(amountUsdc * 100) / 100,
  }));
}

export function calculateRakeAmount(totalPoolUsdc: number, rakeBps: number): number {
  return Math.round(totalPoolUsdc * (rakeBps / 10000) * 100) / 100;
}
