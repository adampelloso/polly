import { create } from "zustand";

interface PicksState {
  contestId: string | null;
  picks: Record<string, string>; // eventId -> pickedOutcome
  setContest: (id: string) => void;
  setPick: (eventId: string, outcome: string) => void;
  clearPicks: () => void;
  isComplete: (eventCount: number) => boolean;
}

export const usePicksStore = create<PicksState>((set, get) => ({
  contestId: null,
  picks: {},

  setContest: (id) => {
    const current = get().contestId;
    if (current !== id) {
      set({ contestId: id, picks: {} });
    }
  },

  setPick: (eventId, outcome) => {
    set((state) => ({
      picks: { ...state.picks, [eventId]: outcome },
    }));
  },

  clearPicks: () => {
    set({ picks: {}, contestId: null });
  },

  isComplete: (eventCount) => {
    return Object.keys(get().picks).length >= eventCount;
  },
}));
