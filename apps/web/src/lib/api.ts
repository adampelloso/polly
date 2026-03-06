import type {
  ContestListItem,
  ContestDetail,
  StandingsEntry,
  ScoredEntry,
  SubmitEntryRequest,
  Entry,
  PolymarketEvent,
  CreateContestRequest,
  ContestStatus,
} from "@polypool/shared";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export const api = {
  getContests: () => fetchApi<ContestListItem[]>("/api/contests"),

  getContest: (id: string) => fetchApi<ContestDetail>(`/api/contests/${id}`),

  submitEntry: (contestId: string, data: SubmitEntryRequest) =>
    fetchApi<Entry>(`/api/contests/${contestId}/enter`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getStandings: (contestId: string) =>
    fetchApi<StandingsEntry[]>(`/api/contests/${contestId}/standings`),

  getOdds: (contestId: string) =>
    fetchApi<Record<string, Record<string, number>>>(`/api/contests/${contestId}/odds`),

  getResults: (contestId: string) =>
    fetchApi<ScoredEntry[]>(`/api/contests/${contestId}/standings`),

  searchMarkets: (query: string) =>
    fetchApi<PolymarketEvent[]>(
      `/api/markets/search?q=${encodeURIComponent(query)}`
    ),

  fetchEventBySlug: (slug: string) =>
    fetchApi<PolymarketEvent>(`/api/markets/event/${encodeURIComponent(slug)}`),

  createContest: (data: CreateContestRequest) =>
    fetchApi<ContestDetail>("/api/contests", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  transitionContest: (contestId: string, status: ContestStatus) =>
    fetchApi<ContestDetail>(`/api/contests/${contestId}/transition`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  voidContest: (contestId: string) =>
    fetchApi<ContestDetail>(`/api/contests/${contestId}/transition`, {
      method: "POST",
      body: JSON.stringify({ status: "voided" }),
    }),
};
