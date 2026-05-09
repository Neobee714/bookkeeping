import { create } from 'zustand';

export type ThemeName = 'ios' | 'porcelain';

const THEME_STORAGE_KEY = 'app_theme';
const isBrowser = typeof window !== 'undefined';

const readStoredTheme = (): ThemeName => {
  if (!isBrowser) {
    return 'ios';
  }
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return value === 'porcelain' ? 'porcelain' : 'ios';
};

const applyTheme = (theme: ThemeName): void => {
  if (!isBrowser) {
    return;
  }
  document.documentElement.setAttribute('data-theme', theme);
};

// 模块加载即应用主题，避免首帧闪烁
applyTheme(readStoredTheme());

interface ThemeState {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStoredTheme(),
  setTheme: (theme) => {
    if (isBrowser) {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    applyTheme(theme);
    set({ theme });
  },
}));

export const themeLabel: Record<ThemeName, string> = {
  ios: 'iOS 默认',
  porcelain: '暖瓷',
};
