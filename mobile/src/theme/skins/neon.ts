import type { SkinDefinition, SkinPalette } from '../types';

/** 06 暗夜霓虹：近黑底、紫青渐变、发光描边。锁定深色。 */
const dark: SkinPalette = {
  colors: {
    background: '#08080F',
    card: '#111120',
    surface: '#191927',
    textPrimary: '#EDEDF7',
    textSecondary: '#9A9AB8',
    textTertiary: '#6E6E8C',
    primary: '#8B6CFF',
    secondary: '#00E0FF',
    income: '#3DFFA2',
    expense: '#FF5C8A',
    border: '#232338',
    chipSoftBg: '#1E1B38',
    chipSoftText: '#B9A8FF',
    overlay: 'rgba(0, 0, 0, 0.66)',
    tabBarBg: '#0B0B14',
    tabInactive: '#6E6E8C',
    onHero: '#FFFFFF',
    onHeroMuted: 'rgba(255, 255, 255, 0.72)',
    onAccent: '#FFFFFF',
  },
  gradient: ['#6A4BF0', '#0093B5'],
  heroGradient: ['#241B4D', '#0C0C18'],
  authGradient: ['#2A1B5E', '#08080F'],
  surfaces: {
    card: {
      backgroundColor: '#111120',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#1D1D2E',
      boxShadow: '0 0 18px rgba(124, 92, 255, 0.10)',
    },
    input: {
      backgroundColor: '#191927',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#242438',
    },
    chip: {
      backgroundColor: '#191927',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: '#242438',
    },
    sheet: {
      backgroundColor: '#0D0D18',
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderTopWidth: 1,
      borderTopColor: 'rgba(124, 92, 255, 0.35)',
    },
    tabBar: { backgroundColor: '#0B0B14', borderTopColor: '#1A1A2C' },
    hero: {
      backgroundColor: '#111120',
      borderRadius: 22,
      borderWidth: 1,
      borderColor: 'rgba(124, 92, 255, 0.4)',
      boxShadow: '0 0 26px rgba(124, 92, 255, 0.22)',
    },
  },
  fabShadow: { boxShadow: '0 0 26px rgba(0, 224, 255, 0.45)' },
};

const neon: SkinDefinition = {
  id: 'neon',
  name: '暗夜霓虹',
  tagline: '近黑底与紫青光晕，夜里记账最舒服',
  mode: 'dark',
  dark,
};

export default neon;
