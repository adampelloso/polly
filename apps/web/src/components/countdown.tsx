"use client";

import { useState, useEffect } from "react";

interface CountdownProps {
  targetDate: Date;
  prefix?: string;
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "00:00:00";

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0)
    return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  if (minutes > 0)
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return `00:${String(seconds).padStart(2, "0")}`;
}

export function Countdown({
  targetDate,
  prefix = "Closes in",
}: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const ms = new Date(targetDate).getTime() - now;

  if (ms <= 0) {
    return (
      <span className="border border-neutral-300 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-neutral-400">
        Locked
      </span>
    );
  }

  return (
    <span className="text-xs text-neutral-400">
      {prefix}{" "}
      <span className="font-mono font-bold tabular-nums text-black">
        {formatTimeLeft(ms)}
      </span>
    </span>
  );
}
