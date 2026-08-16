/**
 * 主题配色 token。
 *
 * 风格基调:「活力渐变」(ARCH.md 第 5 节)。
 * - 主渐变:紫 #8B5CF6 → 粉 #EC4899
 * - 浅色底:浅紫 #F7F5FF;白色大圆角卡片
 * - 收入绿 / 支出红沿用
 * - 暗色模式:紫调深色底,保留高饱和渐变点缀,避免低饱和大面积暗色
 */

/** 主渐变(紫 → 粉),全局唯一来源。 */
export const gradient = {
  start: '#8B5CF6',
  end: '#EC4899',
} as const;

export interface ThemeColors {
  /** 页面背景。 */
  background: string;
  /** 卡片背景。 */
  card: string;
  /** 输入框/次级表面背景。 */
  surface: string;
  /** 主文字。 */
  textPrimary: string;
  /** 次级文字。 */
  textSecondary: string;
  /** 占位/弱化文字。 */
  textTertiary: string;
  /** 主色(紫)。 */
  primary: string;
  /** 次色(粉)。 */
  secondary: string;
  /** 收入色(绿)。 */
  income: string;
  /** 支出色(红)。 */
  expense: string;
  /** 边框/分隔线。 */
  border: string;
  /** 弹窗遮罩。 */
  overlay: string;
  /** 底部 Tab 背景。 */
  tabBarBg: string;
  /** Tab 未选中色。 */
  tabInactive: string;
}

export const lightColors: ThemeColors = {
  background: '#F7F5FF',
  card: '#FFFFFF',
  surface: '#F1EEFA',
  textPrimary: '#221D35',
  textSecondary: '#6B6478',
  textTertiary: '#9A93A8',
  primary: gradient.start,
  secondary: gradient.end,
  income: '#16A34A',
  expense: '#EF4444',
  border: '#EDE9F5',
  overlay: 'rgba(20, 16, 36, 0.45)',
  tabBarBg: '#FFFFFF',
  tabInactive: '#9A93A8',
};

export const darkColors: ThemeColors = {
  background: '#171322',
  card: '#262036',
  surface: '#2E2742',
  textPrimary: '#F4F1FA',
  textSecondary: '#B9B2C9',
  textTertiary: '#8E86A2',
  primary: '#A78BFA',
  secondary: '#F472B6',
  income: '#4ADE80',
  expense: '#F87171',
  border: '#352D4A',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tabBarBg: '#201A2E',
  tabInactive: '#8E86A2',
};
