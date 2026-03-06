"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";

interface QueueStatsResponse {
  timestamp: string;
  queues: Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }>;
  alerts: Array<{
    queue: string;
    level: "warning" | "critical";
    message: string;
  }>;
}

export function QueueStats() {
  const [data, setData] = useState<QueueStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.getQueueStats();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      void load();
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="border border-neutral-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
          Queue Status
        </h3>
        <button
          onClick={() => void load()}
          className="border border-neutral-300 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-black hover:text-black"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="mt-3 font-mono text-xs text-neutral-400">Loading…</p>}
      {error && <p className="mt-3 font-mono text-xs text-loss">{error}</p>}

      {!loading && !error && data && (
        <>
          <p className="mt-2 font-mono text-[10px] text-neutral-300">
            {new Date(data.timestamp).toLocaleString()}
          </p>
          <div className="mt-3 space-y-2">
            {data.alerts.length > 0 && (
              <div className="border border-loss/30 bg-loss/5 p-3">
                {data.alerts.map((a, i) => (
                  <p key={`${a.queue}-${i}`} className="font-mono text-[11px] text-loss">
                    [{a.level}] {a.queue}: {a.message}
                  </p>
                ))}
              </div>
            )}
            {data.queues.map((q) => (
              <div key={q.name} className="border border-neutral-200 p-3">
                <p className="font-mono text-xs font-bold text-black">{q.name}</p>
                <p className="mt-1 font-mono text-[11px] text-neutral-500">
                  waiting {q.waiting} · active {q.active} · delayed {q.delayed} ·
                  failed {q.failed} · completed {q.completed}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
