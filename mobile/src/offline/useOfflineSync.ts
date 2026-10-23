import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuthStore } from '../store/authStore';
import { useOfflineStore } from '../store/offlineStore';
import { isOnlineNow, startNetworkWatcher, subscribeNetwork } from './network';
import { syncQueue } from './sync';

/**
 * App 根级离线同步：
 * - 启动网络监听；
 * - 登录态恢复后、联网、回前台时跑一轮队列；
 * - 维护 offlineStore 的在线/待同步/失败/同步中状态。
 */
export function useOfflineSync(): void {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const hydrated = useAuthStore((state) => state.hydrated);
  const setOnline = useOfflineStore((state) => state.setOnline);
  const setSyncing = useOfflineStore((state) => state.setSyncing);
  const refreshCounts = useOfflineStore((state) => state.refreshCounts);
  const bumpQueue = useOfflineStore((state) => state.bumpQueue);

  const runSync = useCallback(async () => {
    if (!userId) {
      return;
    }
    setSyncing(true);
    try {
      const result = await syncQueue(userId);
      await refreshCounts(userId);
      if (result.synced > 0 || result.failed > 0) {
        bumpQueue();
      }
    } finally {
      setSyncing(false);
    }
  }, [bumpQueue, refreshCounts, setSyncing, userId]);

  useEffect(() => startNetworkWatcher(), []);

  useEffect(() => {
    setOnline(isOnlineNow());
    return subscribeNetwork((online) => {
      setOnline(online);
      if (online) {
        runSync().catch(() => undefined);
      }
    });
  }, [runSync, setOnline]);

  useEffect(() => {
    if (!hydrated || !userId) {
      return;
    }
    refreshCounts(userId)
      .then(() => runSync())
      .catch(() => undefined);
  }, [hydrated, refreshCounts, runSync, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        runSync().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [runSync]);
}
