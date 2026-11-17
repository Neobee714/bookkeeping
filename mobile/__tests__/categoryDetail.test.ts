import {
  aggregateNotes,
  buildDayGroups,
  elapsedDaysOfMonth,
  filterCategoryTransactions,
  UNLABELED_NOTE,
} from '../src/utils/categoryDetail';
import type { Transaction } from '../src/types';

let seq = 0;

const makeTx = (partial: Partial<Transaction>): Transaction =>
  ({
    id: ++seq,
    amount: 10,
    type: 'expense',
    category: '餐饮',
    merchant: null,
    note: null,
    date: '2026-11-15',
    ...partial,
  } as Transaction);

describe('filterCategoryTransactions', () => {
  const txs = [
    makeTx({ category: '餐饮', amount: 28 }),
    makeTx({ category: '餐饮', amount: 236, merchant: '萍姐火锅' }),
    makeTx({ category: '交通', amount: 4 }),
    makeTx({ category: '餐饮', amount: 500, type: 'income' }),
  ];

  it('分类维度：只保留该分类的支出', () => {
    const result = filterCategoryTransactions(txs, 'category', '餐饮');
    expect(result.map((tx) => tx.amount)).toEqual([28, 236]);
  });

  it('商家维度：按 trim 后的商家名过滤', () => {
    const result = filterCategoryTransactions(txs, 'merchant', '萍姐火锅');
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(236);
  });

  it('商家维度不匹配时不返回空备注账单', () => {
    expect(filterCategoryTransactions(txs, 'merchant', '不存在')).toEqual([]);
  });
});

describe('buildDayGroups', () => {
  const txs = [
    makeTx({ id: 1, date: '2026-11-15', amount: 236 }),
    makeTx({ id: 2, date: '2026-11-15', amount: 19.1 }),
    makeTx({ id: 3, date: '2026-11-14', amount: 145.5 }),
  ];

  it('按日期倒序分组并合计当日小计', () => {
    const groups = buildDayGroups(txs);
    expect(groups.map((g) => g.date)).toEqual(['2026-11-15', '2026-11-14']);
    expect(groups[0].total).toBe(255.1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].total).toBe(145.5);
  });

  it('空输入返回空数组', () => {
    expect(buildDayGroups([])).toEqual([]);
  });
});

describe('aggregateNotes', () => {
  it('相同备注合并、金额降序、计算次数与平均', () => {
    const txs = [
      makeTx({ note: '聚会餐', amount: 236 }),
      makeTx({ note: '奶茶', amount: 19.1 }),
      makeTx({ note: ' 聚会餐 ', amount: 100 }),
      makeTx({ note: null, amount: 40.3 }),
    ];
    const rows = aggregateNotes(txs);
    expect(rows.map((r) => r.note)).toEqual(['聚会餐', '未备注', '奶茶']);
    expect(rows[0]).toMatchObject({ amount: 336, count: 2, avg: 168 });
    expect(rows[1].note).toBe(UNLABELED_NOTE);
    expect(rows[2].amount).toBe(19.1);
  });

  it('金额合计等于明细合计', () => {
    const txs = [
      makeTx({ note: 'a', amount: 0.1 }),
      makeTx({ note: 'b', amount: 0.2 }),
      makeTx({ note: null, amount: 0.3 }),
    ];
    const sum = aggregateNotes(txs).reduce((acc, row) => acc + row.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(0.6);
  });
});

describe('elapsedDaysOfMonth', () => {
  const today = new Date(2026, 10, 17); // 2026-11-17

  it('过去月份取整月天数', () => {
    expect(elapsedDaysOfMonth('2026-10', today)).toBe(31);
    expect(elapsedDaysOfMonth('2026-02', today)).toBe(28);
  });

  it('当月取今天几号', () => {
    expect(elapsedDaysOfMonth('2026-11', today)).toBe(17);
  });

  it('未来月份兜底 1（防除零）', () => {
    expect(elapsedDaysOfMonth('2026-12', today)).toBe(1);
  });
});
