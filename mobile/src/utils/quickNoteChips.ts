/**
 * 备注 chip 的合并规则(纯函数,不依赖 React,便于单测)。
 *
 * 规则:
 * 1. ★ 收藏的备注排最前,**保持后端顺序**(后端已按收藏时间倒序);
 * 2. 紧随其后是当前分类的自动推荐,**排除**已在收藏里的同名备注;
 * 3. 整体截断到 `limit`(默认 8)。
 */
import type { QuickNoteCandidate } from '../types';

/** chip 来源:手动收藏 / 系统按分类推荐。 */
export type QuickNoteChipSource = 'pinned' | 'auto';

export interface QuickNoteChip {
  note: string;
  count: number;
  last_used: string | null;
  source: QuickNoteChipSource;
}

export interface BuildNoteChipsInput {
  pinned?: QuickNoteCandidate[] | null;
  byCategory?: Record<string, QuickNoteCandidate[]> | null;
  /** 当前所选分类;为空则只展示收藏项。 */
  category?: string | null;
  limit?: number;
}

/** 逐项做防御性归一化:空备注丢弃,异常字段回落到安全值。 */
const toChips = (
  items: QuickNoteCandidate[] | null | undefined,
  source: QuickNoteChipSource,
): QuickNoteChip[] => {
  if (!Array.isArray(items)) {
    return [];
  }
  const chips: QuickNoteChip[] = [];
  for (const item of items) {
    const note = typeof item?.note === 'string' ? item.note.trim() : '';
    if (!note) {
      continue;
    }
    chips.push({
      note,
      count: typeof item.count === 'number' ? item.count : 0,
      last_used: typeof item.last_used === 'string' ? item.last_used : null,
      source,
    });
  }
  return chips;
};

export function buildNoteChips({
  pinned,
  byCategory,
  category,
  limit = 8,
}: BuildNoteChipsInput): QuickNoteChip[] {
  const pinnedChips = toChips(pinned, 'pinned');
  const pinnedNotes = new Set(pinnedChips.map((chip) => chip.note));
  const autoChips = toChips(
    category ? byCategory?.[category] : undefined,
    'auto',
  ).filter((chip) => !pinnedNotes.has(chip.note));

  return [...pinnedChips, ...autoChips].slice(0, Math.max(limit, 0));
}
