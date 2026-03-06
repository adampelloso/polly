import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useContests() {
  return useQuery({
    queryKey: ["contests"],
    queryFn: api.getContests,
  });
}

export function useContest(id: string) {
  return useQuery({
    queryKey: ["contest", id],
    queryFn: () => api.getContest(id),
    enabled: !!id,
  });
}

export function useStandings(contestId: string) {
  return useQuery({
    queryKey: ["standings", contestId],
    queryFn: () => api.getStandings(contestId),
    enabled: !!contestId,
  });
}

export function useResults(contestId: string) {
  return useQuery({
    queryKey: ["results", contestId],
    queryFn: () => api.getResults(contestId),
    enabled: !!contestId,
  });
}

export function useContestOdds(contestId: string, enabled = true) {
  return useQuery({
    queryKey: ["odds", contestId],
    queryFn: () => api.getOdds(contestId),
    enabled: !!contestId && enabled,
    refetchInterval: 30_000,
  });
}
