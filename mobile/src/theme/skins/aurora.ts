import type { SkinDefinition, SkinPalette } from '../types';

/** 10 流动极光：浅底、白卡、靛蓝→青绿渐变。默认主题。 */
const light: SkinPalette = {
  colors: {
    background: '#F5F7FB',
    card: '#FFFFFF',
    surface: '#F1F3F9',
    textPrimary: '#14161F',
    textSecondary: '#646B80',
    textTertiary: '#98A0B0',
    primary: '#6D5BFF',
    secondary: '#1EA88F',
    income: '#0F9E76',
    expense: '#E0566E',
    border: '#E8EBF3',
    chipSoftBg: '#EFECFF',
    chipSoftText: '#5B4BD6',
    overlay: 'rgba(14, 16, 28, 0.45)',
    tabBarBg: '#FFFFFF',
    tabInactive: '#98A0B0',
    onHero: '#FFFFFF',
    onHeroMuted: 'rgba(255, 255, 255, 0.82)',
    onAccent: '#FFFFFF',
  },
  gradient: ['#5B49F5', '#17977F'],
  heroGradient: ['#6D5BFF', '#1EA88F'],
  authGradient: ['#3B2FA8', '#0E6E63'],
  surfaces: {
    card: {
      backgroundColor: '#FFFFFF',
      borderRadius: 22,
      boxShadow: '0 8px 22px rgba(20, 22, 40, 0.07)',
    },
    input: { backgroundColor: '#F1F3F9', borderRadius: 14 },
    chip: { backgroundColor: '#F1F3F9', borderRadius: 999 },
    sheet: {
      backgroundColor: '#FFFFFF',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
    },
    tabBar: { backgroundColor: '#FFFFFF', borderTopColor: '#E8EBF3' },
    hero: {
      backgroundColor: '#FFFFFF',
      borderRadius: 26,
      boxShadow: '0 14px 30px rgba(20, 22, 40, 0.12)',
    },
  },
  fabShadow: { boxShadow: '0 12px 24px rgba(109, 91, 255, 0.35)' },
};

const dark: SkinPalette = {
  colors: {
    background: '#0F1118',
    card: '#171A24',
    surface: '#1F2330',
    textPrimary: '#F2F4FA',
    textSecondary: '#B0B6C8',
    textTertiary: '#7F879B',
    primary: '#9C8CFF',
    secondary: '#4FD3B8',
    income: '#43D6A4',
    expense: '#FF7A90',
    border: '#262B39',
    chipSoftBg: '#262B4A',
    chipSoftText: '#C6BEFF',
    overlay: 'rgba(0, 0, 0, 0.62)',
    tabBarBg: '#141822',
    tabInactive: '#7F879B',
    onHero: '#FFFFFF',
    onHeroMuted: 'rgba(255, 255, 255, 0.78)',
    onAccent: '#0F1118',
  },
  gradient: ['#8B7BFF', '#2FC7AE'],
  heroGradient: ['#3B2FA8', '#126B63'],
  authGradient: ['#241C66', '#0B3B39'],
  surfaces: {
    card: {
      backgroundColor: '#171A24',
      borderRadius: 22,
      borderWidth: 1,
      borderColor: '#232838',
      boxShadow: '0 10px 24px rgba(0, 0, 0, 0.35)',
    },
    input: {
      backgroundColor: '#1F2330',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#2A3042',
    },
    chip: { backgroundColor: '#1F2330', borderRadius: 999 },
    sheet: {
      backgroundColor: '#121620',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderTopWidth: 1,
      borderTopColor: '#242A38',
    },
    tabBar: { backgroundColor: '#141822', borderTopColor: '#242A38' },
    hero: {
      backgroundColor: '#171A24',
      borderRadius: 26,
      borderWidth: 1,
      borderColor: '#2A3042',
      boxShadow: '0 14px 30px rgba(0, 0, 0, 0.45)',
    },
  },
  fabShadow: { boxShadow: '0 12px 26px rgba(139, 123, 255, 0.4)' },
};

const aurora: SkinDefinition = {
  id: 'aurora',
  name: '流动极光',
  tagline: '白卡、彩雾与渐变，最接近现在的样子',
  mode: 'both',
  light,
  dark,
};

export default aurora;
