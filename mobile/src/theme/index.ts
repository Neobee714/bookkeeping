import { useColorScheme } from 'react-native';

import { useThemeStore } from '../store/themeStore';
import { resolveSkin } from './skins';
import type { Skin, ThemeColors } from './types';

export { spacing, radius } from './spacing';
export { typography } from './typography';
export { SKINS, DEFAULT_SKIN_ID, getSkinDefinition, resolveSkin } from './skins';
export type {
  Skin,
  SkinDefinition,
  SkinId,
  SkinMode,
  ThemeColors,
  ThemeMode,
} from './types';

/**
 * 当前生效的皮肤（含颜色、渐变、表面样式）。
 * 锁定模式（04 亮 / 06 暗）会忽略偏好与系统。
 */
export function useSkin(): Skin {
  const skinId = useThemeStore((state) => state.skinId);
  const mode = useThemeStore((state) => state.mode);
  const systemScheme = useColorScheme();
  return resolveSkin(skinId, mode, systemScheme === 'dark');
}

/** 是否处于暗色渲染（用于状态栏图标）。 */
export function useIsDarkMode(): boolean {
  return useSkin().scheme === 'dark';
}

/** 语义色板；等价于 useSkin().colors，保留旧调用点。 */
export function useTheme(): ThemeColors {
  return useSkin().colors;
}
