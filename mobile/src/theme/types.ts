import type { ViewStyle } from 'react-native';

/** 主题标识。新增皮肤时在这里加 id，并在 skins/index.ts 注册。 */
export type SkinId = 'neu' | 'neon' | 'candy' | 'aurora';

/**
 * 皮肤支持的明暗模式：
 * - light：锁定亮色（浮雕主题）
 * - dark：锁定深色（霓虹主题）
 * - both：跟随用户偏好 / 系统
 */
export type SkinMode = 'light' | 'dark' | 'both';

/** 用户的外观偏好；system 表示跟随系统。 */
export type ThemeMode = 'system' | 'light' | 'dark';

/** 语义色板。组件只读这里的键，不出现十六进制字面量。 */
export interface ThemeColors {
  background: string;
  card: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  secondary: string;
  income: string;
  expense: string;
  border: string;
  chipSoftBg: string;
  chipSoftText: string;
  overlay: string;
  tabBarBg: string;
  tabInactive: string;
  /** 渐变卡上的主文字（深色浮雕卡用深色）。 */
  onHero: string;
  /** 渐变卡上的次要文字。 */
  onHeroMuted: string;
  /** 渐变按钮上的文字。 */
  onAccent: string;
}

/** 一套配色的完整形态：颜色 + 渐变 + 表面样式。 */
export interface SkinPalette {
  colors: ThemeColors;
  /** 主强调渐变：按钮 / 分段选中 / FAB。 */
  gradient: [string, string];
  /** 月度汇总卡渐变；null 表示使用 surfaces.hero 的纯色浮雕卡。 */
  heroGradient: [string, string] | null;
  /** 登录/注册整屏背景。 */
  authGradient: [string, string];
  surfaces: {
    card: ViewStyle;
    input: ViewStyle;
    chip: ViewStyle;
    sheet: ViewStyle;
    tabBar: ViewStyle;
    hero: ViewStyle;
  };
  fabShadow: ViewStyle;
}

/** 皮肤定义：静态注册表条目。 */
export interface SkinDefinition {
  id: SkinId;
  name: string;
  tagline: string;
  mode: SkinMode;
  light?: SkinPalette;
  dark?: SkinPalette;
}

/** 解析后的皮肤：组件实际消费的对象。 */
export interface Skin extends SkinPalette {
  id: SkinId;
  name: string;
  tagline: string;
  mode: SkinMode;
  /** 当前实际渲染的明暗。 */
  scheme: 'light' | 'dark';
}
