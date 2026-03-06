"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { WalletButton } from "@/components/wallet-button";

export function Nav() {
  const { authenticated } = useAuth();

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-neutral-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/polly.png" alt="Polly" width={28} height={28} />
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/results"
              className="hidden text-xs font-medium uppercase tracking-wider text-neutral-400 transition-colors hover:text-black sm:block"
            >
              Results
            </Link>
            <Link
              href="/how-it-works"
              className="hidden text-xs font-medium uppercase tracking-wider text-neutral-400 transition-colors hover:text-black sm:block"
            >
              How it works
            </Link>
            <WalletButton />
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-neutral-200 bg-white/95 backdrop-blur-sm sm:hidden">
        <div
          className={`grid ${authenticated ? "grid-cols-4" : "grid-cols-3"} text-center`}
        >
          <Link
            href="/"
            className="py-3 text-[10px] font-bold uppercase tracking-widest text-black"
          >
            Home
          </Link>
          <Link
            href="/results"
            className="py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-black"
          >
            Results
          </Link>
          {authenticated && (
            <Link
              href="/account"
              className="py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-black"
            >
              Account
            </Link>
          )}
          <Link
            href="/how-it-works"
            className="py-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-black"
          >
            Rules
          </Link>
        </div>
      </nav>
    </>
  );
}
