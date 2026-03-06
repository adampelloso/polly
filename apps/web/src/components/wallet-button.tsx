"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";

function truncateAddress(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function WalletButton() {
  const { ready, authenticated, login, logout, walletAddress } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!ready) {
    return (
      <div className="h-8 w-16 animate-pulse border border-neutral-200 bg-neutral-100" />
    );
  }

  if (!authenticated) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={login}
          className="text-xs font-medium uppercase tracking-wider text-neutral-400 transition-colors hover:text-black"
        >
          Sign up
        </button>
        <button
          onClick={login}
          className="border border-black px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-black transition-colors hover:bg-black hover:text-white"
        >
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 border border-neutral-300 px-3 py-1.5 text-xs font-medium text-black transition-colors hover:border-black"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-win" />
        {walletAddress ? truncateAddress(walletAddress) : "Account"}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 border border-neutral-300 bg-white shadow-lg">
          {walletAddress && (
            <div className="border-b border-neutral-200 px-3 py-2 font-mono text-[10px] text-neutral-400">
              {walletAddress}
            </div>
          )}
          <Link
            href="/account"
            className="block w-full px-3 py-2 text-left text-xs text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-black"
            onClick={() => setOpen(false)}
          >
            Account
          </Link>
          <button
            onClick={() => {
              logout();
              setOpen(false);
            }}
            className="w-full border-t border-neutral-200 px-3 py-2 text-left text-xs text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-black"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
