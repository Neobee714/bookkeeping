import type { SkinDefinition, SkinPalette } from '../types';

/**
 * 04 柔和浮雕：同一底色上用双向软阴影把卡片「压」出来，输入区凹陷。
 * 锁定亮色；深色会让浮雕变成一团灰，不做。
 */
const light: SkinPalette = {
  colors: {
    background: '#E9EDF4',
    card: '#E9EDF4',
    surface: '#E9EDF4',
    textPrimary: '#2B3445',
    textSecondary: '#6F7A8E',
    textTertiary: '#96A0B2',
    primary: '#4F6BED',
    secondary: '#7C93FF',
    income: '#2E9E6B',
    expense: '#D95555',
    border: '#DCE3EE',
    chipSoftBg: '#E9EDF4',
    chipSoftText: '#4F6BED',
    overlay: 'rgba(24, 32, 48, 0.42)',
    tabBarBg: '#E9EDF4',
    tabInactive: '#96A0B2',
    onHero: '#2B3445',
    onHeroMuted: '#6F7A8E',
    onAccent: '#FFFFFF',
  },
  gradient: ['#4F6BED', '#4F6BED'],
  heroGradient: null,
  authGradient: ['#2C3A5C', '#4F6BED'],
  surfaces: {
    card: {
      backgroundColor: '#E9EDF4',
      borderRadius: 22,
      boxShadow: '-5px -5px 10px #FFFFFF, 5px 5px 12px #C8D0DE',
    },
    input: {
      backgroundColor: '#E9EDF4',
      borderRadius: 14,
      boxShadow: 'inset 3px 3px 7px #CBD3E0, inset -3px -3px 7px #FFFFFF',
    },
    chip: {
      backgroundColor: '#E9EDF4',
      borderRadius: 999,
      boxShadow: '3px 3px 7px #C8D0DE, -3px -3px 7px #FFFFFF',
    },
    sheet: {
      backgroundColor: '#E9EDF4',
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
    },
    tabBar: {
      backgroundColor: '#E9EDF4',
      borderTopColor: '#DCE3EE',
      boxShadow: '0 -6px 14px rgba(163, 177, 198, 0.35)',
    },
    hero: {
      backgroundColor: '#E9EDF4',
      borderRadius: 24,
      boxShadow: '-8px -8px 18px #FFFFFF, 8px 8px 20px #C8D0DE',
    },
  },
  fabShadow: { boxShadow: '-4px -4px 10px #FFFFFF, 4px 4px 12px #C8D0DE' },
};

const neu: SkinDefinition = {
  id: 'neu',
  name: '柔和浮雕',
  tagline: '同色系软阴影，安静、有触感，只在亮色下成立',
  mode: 'light',
  light,
};

export default neu;
