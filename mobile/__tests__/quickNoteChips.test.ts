/**
 * 备注 chip 合并规则单元测试(纯函数,无需原生环境)。
 */
import type { QuickNoteCandidate } from '../src/types';
import { buildNoteChips } from '../src/utils/quickNoteChips';

const candidate = (
  note: string,
  count = 2,
  lastUsed: string | null = '2026-10-01',
): QuickNoteCandidate => ({ note, count, last_used: lastUsed });

const notesOf = (chips: { note: string }[]): string[] => chips.map((c) => c.note);

describe('buildNoteChips', () => {
  test('pinned 排最前且保持后端顺序', () => {
    const chips = buildNoteChips({
      pinned: [candidate('早餐'), candidate('地铁'), candidate('房租')],
      byCategory: { 餐饮: [candidate('买菜')] },
      category: '餐饮',
    });

    expect(notesOf(chips)).toEqual(['早餐', '地铁', '房租', '买菜']);
    expect(chips.slice(0, 3).every((c) => c.source === 'pinned')).toBe(true);
    expect(chips[3].source).toBe('auto');
  });

  test('推荐按当前分类过滤,不混入其它分类', () => {
    const chips = buildNoteChips({
      pinned: [],
      byCategory: {
        餐饮: [candidate('买菜'), candidate('咖啡')],
        交通: [candidate('地铁')],
      },
      category: '餐饮',
    });

    expect(notesOf(chips)).toEqual(['买菜', '咖啡']);
    expect(chips.every((c) => c.source === 'auto')).toBe(true);
  });

  test('与 pinned 同名的推荐被去重', () => {
    const chips = buildNoteChips({
      pinned: [candidate('早餐')],
      byCategory: { 餐饮: [candidate('早餐'), candidate('买菜')] },
      category: '餐饮',
    });

    expect(notesOf(chips)).toEqual(['早餐', '买菜']);
    expect(chips.filter((c) => c.note === '早餐')).toHaveLength(1);
    expect(chips[0].source).toBe('pinned');
  });

  test('总数截断到 8 个(pinned 优先保留)', () => {
    const chips = buildNoteChips({
      pinned: [candidate('收藏1'), candidate('收藏2')],
      byCategory: {
        餐饮: Array.from({ length: 10 }, (_, i) => candidate(`推荐${i}`)),
      },
      category: '餐饮',
    });

    expect(chips).toHaveLength(8);
    expect(notesOf(chips)).toEqual([
      '收藏1',
      '收藏2',
      '推荐0',
      '推荐1',
      '推荐2',
      '推荐3',
      '推荐4',
      '推荐5',
    ]);
  });

  test('limit 可覆盖默认上限', () => {
    const chips = buildNoteChips({
      pinned: [candidate('a'), candidate('b')],
      byCategory: { 餐饮: [candidate('c')] },
      category: '餐饮',
      limit: 2,
    });

    expect(notesOf(chips)).toEqual(['a', 'b']);
  });

  test('当前分类无候选时只剩 pinned', () => {
    const pinned = [candidate('早餐'), candidate('买菜')];

    expect(
      notesOf(
        buildNoteChips({ pinned, byCategory: { 交通: [candidate('地铁')] }, category: '餐饮' }),
      ),
    ).toEqual(['早餐', '买菜']);
    expect(notesOf(buildNoteChips({ pinned, byCategory: {}, category: '餐饮' }))).toEqual([
      '早餐',
      '买菜',
    ]);
    expect(notesOf(buildNoteChips({ pinned, byCategory: undefined, category: '餐饮' }))).toEqual([
      '早餐',
      '买菜',
    ]);
  });

  test('无数据 / 异常结构时返回空数组,不抛异常', () => {
    expect(buildNoteChips({})).toEqual([]);
    expect(buildNoteChips({ pinned: null, byCategory: null, category: null })).toEqual([]);
    expect(
      buildNoteChips({
        pinned: [{ note: '  ' }] as QuickNoteCandidate[],
        byCategory: { 餐饮: [candidate('')] },
        category: '餐饮',
      }),
    ).toEqual([]);
  });
});
