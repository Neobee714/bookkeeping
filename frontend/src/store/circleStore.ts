import { create } from 'zustand';

interface CircleState {
  pendingCount: number;
  setPendingCount: (count: number) => void;
}

export const useCircleStore = create<CircleState>((set) => ({
  pendingCount: 0,
  setPendingCount: (count) => set({ pendingCount: count }),
}));
