import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { SkinId, ThemeMode } from '../theme/types';

export type { ThemeMode };

const THEME_MODE_KEY = 'bookkeeping.theme_mode';
const THEME_SKIN_KEY = 'bookkeeping.theme_skin';

const SKIN_IDS: SkinId[] = ['aurora', 'candy', 'neon', 'neu'];

interface ThemeState {
  /** 明暗偏好：跟随系统（默认）/ 强制亮色 / 强制暗色。锁定皮肤会忽略它。 */
  mode: ThemeMode;
  /** 当前皮肤。 */
  skinId: SkinId;
  setMode: (mode: ThemeMode) => Promise<void>;
  setSkin: (skinId: SkinId) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'system',
  skinId: 'aurora',
  setMode: async (mode) => {
    try {
      await AsyncStorage.setItem(THEME_MODE_KEY, mode);
    } catch {
      // 持久化失败不阻塞切换
    }
    set({ mode });
  },
  setSkin: async (skinId) => {
    try {
      await AsyncStorage.setItem(THEME_SKIN_KEY, skinId);
    } catch {
      // 持久化失败不阻塞切换
    }
    set({ skinId });
  },
}));

/**
 * 应用启动时恢复外观设置（皮肤 + 明暗偏好）。
 * 一次读完两个 key，避免先渲染默认皮肤再闪一下。
 */
export async function loadStoredTheme(): Promise<void> {
  try {
    const [storedMode, storedSkin] = await Promise.all([
      AsyncStorage.getItem(THEME_MODE_KEY),
      AsyncStorage.getItem(THEME_SKIN_KEY),
    ]);
    const next: Partial<ThemeState> = {};
    if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') {
      next.mode = storedMode;
    }
    if (storedSkin && SKIN_IDS.includes(storedSkin as SkinId)) {
      next.skinId = storedSkin as SkinId;
    }
    if (Object.keys(next).length > 0) {
      useThemeStore.setState(next);
    }
  } catch {
    // 读取失败保持默认皮肤与跟随系统
  }
}
