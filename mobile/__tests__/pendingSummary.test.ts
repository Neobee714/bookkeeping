import { applyPendingToSummary } from '../src/offline/summary';
import type { PendingTransaction } from '../src/offline/types';
import type { MonthlySummary } from '../src/types';

const summary: MonthlySummary = {
  month: '2026-10',
  total_income: 1000,
  total_expense: 200,
  balance: 800,
  transaction_count: 5,
  category_expenses: { 餐饮: 100 },
  note_breakdown: {},
};

const makeItem = (
  clientId: string,
  amount: number,
  type: 'income' | 'expense',
  category = '餐饮',
): PendingTransaction => ({
  clientId,
  payload: { amount, type, category, note: 'test', date: '2026-10-23' },
  createdAt: new Date().toISOString(),
  status: 'pending',
  attempts: 0,
});

test('支出与收入分别累加，结余和笔数同步变化', () => {
  const result = applyPendingToSummary(summary, [
    makeItem('a', 12.5, 'expense'),
    makeItem('b', 100, 'income'),
  ]);

  expect(result).not.toBeNull();
  expect(result?.total_income).toBe(1100);
  expect(result?.total_expense).toBe(212.5);
  expect(result?.balance).toBe(887.5);
  expect(result?.transaction_count).toBe(7);
  expect(result?.category_expenses['餐饮']).toBe(112.5);
});

test('没有待同步项时原样返回', () => {
  expect(applyPendingToSummary(summary, [])).toBe(summary);
});

test('summary 为空时返回 null', () => {
  expect(applyPendingToSummary(null, [makeItem('a', 1, 'expense')])).toBeNull();
});
