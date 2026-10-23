import { create } from 'zustand';

import { getQueueCounts } from '../offline/queue';

interface OfflineState {
  /** NetInfo 判定当前是否有网。 */
  isOnline: boolean;
  /** 待上传条数（status=pending）。 */
  pendingCount: number;
  /** 同步失败条数（status=failed）。 */
  failedCount: number;
  /** 是否正在跑一轮同步。 */
  syncing: boolean;
  /** 队列每次变更 +1，页面据此重新合并待同步项。 */
  queueVersion: number;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  refreshCounts: (userId: number) => Promise<void>;
  bumpQueue: () => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  pendingCount: 0,
  failedCount: 0,
  syncing: false,
  queueVersion: 0,

  setOnline: (online) => set({ isOnline: online }),
  setSyncing: (syncing) => set({ syncing }),

  refreshCounts: async (userId) => {
    const counts = await getQueueCounts(userId);
    set({ pendingCount: counts.pending, failedCount: counts.failed });
  },

  bumpQueue: () => set((state) => ({ queueVersion: state.queueVersion + 1 })),
}));
