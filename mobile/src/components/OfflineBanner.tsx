import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '../store/authStore';
import { useOfflineStore } from '../store/offlineStore';
import { radius, spacing, typography, useTheme } from '../theme';
import { retryFailed } from '../offline/queue';
import { syncQueue } from '../offline/sync';

/**
 * 全局离线/同步状态悬浮条。
 *
 * 放在底部 Tab 上方（而不是页面顶部），避免和状态栏/各页面自定义 header 打架。
 */
export default function OfflineBanner() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isOnline = useOfflineStore((state) => state.isOnline);
  const pendingCount = useOfflineStore((state) => state.pendingCount);
  const failedCount = useOfflineStore((state) => state.failedCount);
  const syncing = useOfflineStore((state) => state.syncing);
  const setSyncing = useOfflineStore((state) => state.setSyncing);
  const refreshCounts = useOfflineStore((state) => state.refreshCounts);
  const bumpQueue = useOfflineStore((state) => state.bumpQueue);

  if (!userId) {
    return null;
  }

  const hasQueue = pendingCount > 0 || failedCount > 0;
  if (isOnline && !hasQueue) {
    return null;
  }

  const failed = failedCount > 0;
  let label = '离线模式 · 显示本地缓存';
  if (syncing) {
    label = '正在同步…';
  } else if (failed) {
    label = `${failedCount} 笔同步失败 · 点此重试`;
  } else if (!isOnline) {
    label = pendingCount > 0 ? `离线 · ${pendingCount} 笔待同步` : '离线模式 · 显示本地缓存';
  } else if (pendingCount > 0) {
    label = `${pendingCount} 笔待同步 · 点此重试`;
  }

  const handlePress = async () => {
    if (!userId || syncing) {
      return;
    }
    setSyncing(true);
    try {
      if (failedCount > 0) {
        await retryFailed(userId);
      }
      await syncQueue(userId);
      await refreshCounts(userId);
      bumpQueue();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 72 }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          handlePress().catch(() => undefined);
        }}
        style={({ pressed }) => [
          styles.pill,
          {
            backgroundColor: colors.card,
            borderColor: failed ? colors.expense : colors.border,
          },
          pressed && styles.pressed,
        ]}
      >
        <View
          style={[
            styles.dot,
            { backgroundColor: failed ? colors.expense : colors.primary },
          ]}
        />
        <Text
          style={[
            styles.label,
            { color: failed ? colors.expense : colors.textPrimary },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
    elevation: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    maxWidth: '92%',
  },
  pressed: {
    opacity: 0.8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    ...typography.caption,
    fontWeight: '600',
  },
});
