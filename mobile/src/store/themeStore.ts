import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_MODE_KEY = 'bookkeeping.theme_mode';

interface ThemeState {
  /** 主题模式:跟随系统(默认)/强制亮色/强制暗色。 */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'system',
  setMode: async (mode) => {
    try {
      await AsyncStorage.setItem(THEME_MODE_KEY, mode);
    } catch {
      // 持久化失败不阻塞切换
    }
    set({ mode });
  },
}));

/** 应用启动时恢复已保存的主题模式(默认跟随系统)。 */
export async function loadStoredThemeMode(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(THEME_MODE_KEY);
    if (stored === 'light' || stored === 'dark') {
      useThemeStore.setState({ mode: stored });
    }
  } catch {
    // 读取失败保持跟随系统
  }
}
