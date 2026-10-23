import type { SkinDefinition, SkinPalette } from '../types';

/** 08 糖果马卡龙：奶油粉橙、超大圆角、柔和投影。 */
const light: SkinPalette = {
  colors: {
    background: '#FFF8F5',
    card: '#FFFFFF',
    surface: '#FFF1F6',
    textPrimary: '#3D2B36',
    textSecondary: '#8A7480',
    textTertiary: '#B8A3AE',
    primary: '#F4739B',
    secondary: '#F49B67',
    income: '#2FA98A',
    expense: '#E85E7C',
    border: '#F7E3EB',
    chipSoftBg: '#FFEDF3',
    chipSoftText: '#C2557A',
    overlay: 'rgba(60, 20, 35, 0.45)',
    tabBarBg: '#FFFFFF',
    tabInactive: '#B8A3AE',
    onHero: '#4A2230',
    onHeroMuted: 'rgba(74, 34, 48, 0.72)',
    onAccent: '#4A2230',
  },
  gradient: ['#F4739B', '#F49B67'],
  heroGradient: ['#F4739B', '#F49B67'],
  authGradient: ['#D9537A', '#D9764A'],
  surfaces: {
    card: {
      backgroundColor: '#FFFFFF',
      borderRadius: 24,
      boxShadow: '0 8px 20px rgba(244, 115, 155, 0.12)',
    },
    input: { backgroundColor: '#FFF5F8', borderRadius: 18 },
    chip: { backgroundColor: '#FFF0F5', borderRadius: 999 },
    sheet: {
      backgroundColor: '#FFFFFF',
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
    },
    tabBar: { backgroundColor: '#FFFFFF', borderTopColor: '#F7E3EB' },
    hero: {
      backgroundColor: '#FFFFFF',
      borderRadius: 26,
      boxShadow: '0 12px 26px rgba(244, 115, 155, 0.18)',
    },
  },
  fabShadow: { boxShadow: '0 12px 24px rgba(244, 115, 155, 0.4)' },
};

const dark: SkinPalette = {
  colors: {
    background: '#1E151A',
    card: '#2A1F25',
    surface: '#33262D',
    textPrimary: '#FBEEF3',
    textSecondary: '#C9AEB9',
    textTertiary: '#9B808C',
    primary: '#FF9DBC',
    secondary: '#FFC08A',
    income: '#5ED3B4',
    expense: '#FF8FA5',
    border: '#3C2C34',
    chipSoftBg: '#43303A',
    chipSoftText: '#FFC2D3',
    overlay: 'rgba(0, 0, 0, 0.6)',
    tabBarBg: '#241A20',
    tabInactive: '#9B808C',
    onHero: '#3D2B36',
    onHeroMuted: 'rgba(61, 43, 54, 0.72)',
    onAccent: '#3D2B36',
  },
  gradient: ['#FFB1C7', '#FFC79A'],
  heroGradient: ['#FFB1C7', '#FFC79A'],
  authGradient: ['#B2405F', '#B2622F'],
  surfaces: {
    card: {
      backgroundColor: '#2A1F25',
      borderRadius: 24,
      borderWidth: 1,
      borderColor: '#3A2A32',
      boxShadow: '0 10px 22px rgba(0, 0, 0, 0.4)',
    },
    input: { backgroundColor: '#33262D', borderRadius: 18 },
    chip: { backgroundColor: '#33262D', borderRadius: 999 },
    sheet: {
      backgroundColor: '#241A20',
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
    },
    tabBar: { backgroundColor: '#241A20', borderTopColor: '#3C2C34' },
    hero: {
      backgroundColor: '#2A1F25',
      borderRadius: 26,
      borderWidth: 1,
      borderColor: '#3A2A32',
      boxShadow: '0 12px 26px rgba(0, 0, 0, 0.45)',
    },
  },
  fabShadow: { boxShadow: '0 12px 24px rgba(255, 157, 188, 0.35)' },
};

const candy: SkinDefinition = {
  id: 'candy',
  name: '糖果马卡龙',
  tagline: '奶油粉橙，圆角最软，双人记账更亲切',
  mode: 'both',
  light,
  dark,
};

export default candy;
