import { create } from 'zustand';

interface TransactionSyncState {
  refreshVersion: number;
  bumpRefreshVersion: () => void;
}

export const useTransactionSyncStore = create<TransactionSyncState>((set) => ({
  refreshVersion: 0,
  bumpRefreshVersion: () =>
    set((state) => ({ refreshVersion: state.refreshVersion + 1 })),
}));
