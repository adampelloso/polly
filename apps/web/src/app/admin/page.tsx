"use client";

import { useEffect, useState } from "react";
import type { CreateContestEventInput, ContestDetail } from "@polypool/shared";
import { MarketSearch } from "@/components/admin/market-search";
import { ContestForm } from "@/components/admin/contest-form";
import { ContestManager } from "@/components/admin/contest-manager";
import { QueueStats } from "@/components/admin/queue-stats";

type Tab = "create" | "manage";

export default function AdminPage() {
  const [adminAuth, setAdminAuth] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState<Tab>("create");
  const [legs, setLegs] = useState<CreateContestEventInput[]>([]);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/admin/session", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { authenticated?: boolean };
        if (body.authenticated) {
          setAdminAuth(true);
        }
      } catch {
        // ignore
      }
    };
    checkSession();
  }, []);

  const handleAdminLogin = async () => {
    setAuthError("");
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(body || "Invalid credentials");
      }
      setAdminAuth(true);
      setPassword("");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Login failed");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/session", {
        method: "DELETE",
      });
    } finally {
      setAdminAuth(false);
      setTab("create");
      setLegs([]);
      setSuccessMsg("");
    }
  };

  if (!adminAuth) {
    return (
      <div className="mx-auto max-w-sm py-8">
        <h2 className="text-center text-lg font-extrabold uppercase tracking-tight text-black">
          Admin Access
        </h2>
        <div className="mt-6 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
            placeholder="Password"
            className="w-full border border-neutral-300 bg-white px-4 py-2.5 font-mono text-sm text-black placeholder-neutral-400 outline-none focus:border-black"
          />
          <button
            onClick={handleAdminLogin}
            className="w-full border border-black bg-black py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-black"
          >
            Login
          </button>
          {authError && (
            <p className="font-mono text-xs text-loss">{authError}</p>
          )}
        </div>
      </div>
    );
  }

  const addedConditionIds = new Set(legs.map((l) => l.polymarketConditionId));

  const addLeg = (leg: CreateContestEventInput) => {
    if (addedConditionIds.has(leg.polymarketConditionId)) return;
    setLegs((prev) => [...prev, { ...leg, sortOrder: prev.length }]);
  };

  const removeLeg = (conditionId: string) => {
    setLegs((prev) =>
      prev.filter((l) => l.polymarketConditionId !== conditionId)
    );
  };

  const moveLeg = (index: number, direction: "up" | "down") => {
    setLegs((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleCreated = (contest: ContestDetail) => {
    setSuccessMsg(
      `Contest "${contest.title}" created (${contest.status}). ID: ${contest.id}`
    );
    setLegs([]);
    setTimeout(() => setTab("manage"), 1500);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          onClick={handleLogout}
          className="border border-neutral-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
        >
          Logout
        </button>
      </div>
      {/* Tabs */}
        <div className="mb-6 flex border border-neutral-200">
          <button
            onClick={() => setTab("create")}
            className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
              tab === "create"
                ? "bg-black text-white"
                : "text-neutral-400 hover:text-black"
            }`}
          >
            Create Contest
          </button>
          <button
            onClick={() => setTab("manage")}
            className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
              tab === "manage"
                ? "bg-black text-white"
                : "text-neutral-400 hover:text-black"
            }`}
          >
            Manage Contests
          </button>
        </div>

        {/* Success message */}
        {successMsg && (
          <div className="mb-4 border border-win/30 bg-win/5 p-4 font-mono text-sm text-win">
            {successMsg}
            <button
              onClick={() => setSuccessMsg("")}
              className="ml-2 text-win/60 hover:text-win"
            >
              x
            </button>
          </div>
        )}

        {/* Tab content */}
        {tab === "create" ? (
          <div className="space-y-6">
            <MarketSearch
              onAddLeg={addLeg}
              addedConditionIds={addedConditionIds}
            />
            <div className="border-t border-neutral-200" />
            <ContestForm
              legs={legs}
              onRemoveLeg={removeLeg}
              onMoveLeg={moveLeg}
              onCreated={handleCreated}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <QueueStats />
            <ContestManager />
          </div>
        )}
    </>
  );
}
