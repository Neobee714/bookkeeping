import { useColorScheme } from 'react-native';

import { useThemeStore } from '../store/themeStore';
import { darkColors, lightColors, type ThemeColors } from './colors';

export { gradient } from './colors';
export { spacing, radius } from './spacing';
export { typography } from './typography';
export type { ThemeColors } from './colors';

/** 是否处于暗色模式(考虑手动覆盖与系统跟随)。 */
export function useIsDarkMode(): boolean {
  const mode = useThemeStore((s) => s.mode);
  const systemScheme = useColorScheme();
  return mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
}

/**
 * 依据主题模式(跟随系统/手动)解析当前配色。
 * 在组件内调用 `const colors = useTheme();` 即可获得响应式配色。
 */
export function useTheme(): ThemeColors {
  return useIsDarkMode() ? darkColors : lightColors;
}
