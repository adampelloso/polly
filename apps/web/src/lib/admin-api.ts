import type { ContestDetail, ContestListItem, ContestStatus, CreateContestRequest } from "@polypool/shared";

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const cookie = document.cookie
    .split("; ")
    .find((c) => c.startsWith("polly_admin_csrf="));
  if (!cookie) return null;
  return decodeURIComponent(cookie.split("=")[1] ?? "");
}

async function fetchAdmin<T>(path: string, options?: RequestInit): Promise<T> {
  const csrfToken = getCsrfTokenFromCookie();
  const method = options?.method?.toUpperCase() ?? "GET";
  const headers = new Headers(options?.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (csrfToken && method !== "GET" && method !== "HEAD") {
    headers.set("x-admin-csrf", csrfToken);
  }

  const res = await fetch(path, {
    headers,
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Admin API ${res.status}: ${body}`);
  }

  return res.json();
}

export const adminApi = {
  getContests: () =>
    fetchAdmin<ContestListItem[]>("/api/admin/contests"),

  createContest: (data: CreateContestRequest) =>
    fetchAdmin<ContestDetail>("/api/admin/contests", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  transitionContest: (contestId: string, status: ContestStatus) =>
    fetchAdmin<ContestDetail>(`/api/admin/contests/${contestId}/transition`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  getQueueStats: () =>
    fetchAdmin<{
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
    }>("/api/admin/ops/queues"),
};
