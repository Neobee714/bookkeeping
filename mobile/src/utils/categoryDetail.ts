import type { Transaction } from '../types';

/** v0.21 分类明细页：过滤 / 按日分组 / 备注聚合 / 日均天数，均为纯函数。 */

export type DetailDimension = 'category' | 'merchant';

export interface DayGroup {
  date: string;
  total: number;
  items: Transaction[];
}

export interface NoteAggregate {
  note: string;
  amount: number;
  count: number;
  avg: number;
  /** 该备注下出现过的商家（去重、按出现次数降序，不包含空商家）。 */
  merchants: string[];
}

export const UNLABELED_NOTE = '未备注';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** 只保留支出，并按分类（category===name）或商家（merchant===name）过滤。 */
export function filterCategoryTransactions(
  transactions: Transaction[],
  dimension: DetailDimension,
  name: string,
): Transaction[] {
  return transactions.filter((tx) => {
    if (tx.type !== 'expense') {
      return false;
    }
    if (dimension === 'category') {
      return tx.category === name;
    }
    return (tx.merchant ?? '').trim() === name;
  });
}

/** 按日期倒序分组，组内保持传入顺序（调用方已按时间倒序）。 */
export function buildDayGroups(transactions: Transaction[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  transactions.forEach((tx) => {
    let group = groups.get(tx.date);
    if (!group) {
      group = { date: tx.date, total: 0, items: [] };
      groups.set(tx.date, group);
    }
    group.total = round2(group.total + tx.amount);
    group.items.push(tx);
  });
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * 按备注聚合（trim 后相同文本归一组），金额降序。
 * 未填写备注的账单统一归入「未备注」；每行附带商家列表（次数降序、最多不过滤，由 UI 截断）。
 */
export function aggregateNotes(transactions: Transaction[]): NoteAggregate[] {
  const buckets = new Map<
    string,
    { amount: number; count: number; merchants: Map<string, number> }
  >();
  transactions.forEach((tx) => {
    const note = (tx.note ?? '').trim() || UNLABELED_NOTE;
    const bucket = buckets.get(note) ?? {
      amount: 0,
      count: 0,
      merchants: new Map<string, number>(),
    };
    bucket.amount += tx.amount;
    bucket.count += 1;
    const merchant = (tx.merchant ?? '').trim();
    if (merchant) {
      bucket.merchants.set(merchant, (bucket.merchants.get(merchant) ?? 0) + 1);
    }
    buckets.set(note, bucket);
  });
  return [...buckets.entries()]
    .map(([note, bucket]) => ({
      note,
      amount: round2(bucket.amount),
      count: bucket.count,
      avg: round2(bucket.amount / bucket.count),
      merchants: [...bucket.merchants.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([merchant]) => merchant),
    }))
    .sort((a, b) => b.amount - a.amount || a.note.localeCompare(b.note));
}

/** 日均分母：过去月份取整月天数，当月取今天几号，未来兜底 1（防除零）。 */
export function elapsedDaysOfMonth(month: string, today: Date = new Date()): number {
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  if (month < currentMonth) {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(year, monthNumber, 0).getDate();
  }
  if (month === currentMonth) {
    return Math.max(today.getDate(), 1);
  }
  return 1;
}
