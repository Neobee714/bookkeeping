/** 分类 emoji 与分类主色（图表、分类明细共用；缺失时兜底）。 */
export const CATEGORY_EMOJI: Record<string, string> = {
  餐饮: '🍜',
  交通: '🚇',
  日用: '🛒',
  娱乐: '🎮',
  医疗: '💊',
  教育: '📚',
  购物: '🛍️',
  零食: '🍿',
  收入: '💰',
  生活费: '💵',
  其他: '📌',
};

export const getCategoryEmoji = (name: string): string =>
  CATEGORY_EMOJI[name] ?? '🏷️';
