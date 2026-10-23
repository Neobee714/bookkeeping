import type { MonthlySummary } from '../types';
import type { PendingTransaction } from './types';

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * 把待同步账单的增量叠加到缓存的月度汇总上。
 *
 * 只调整首页卡片用到的总量字段；category_expenses 同步累加，
 * note_breakdown 保持缓存值（同步完成后会重新拉取服务端汇总）。
 */
export function applyPendingToSummary(
  summary: MonthlySummary | null,
  pending: PendingTransaction[],
): MonthlySummary | null {
  if (!summary || pending.length === 0) {
    return summary;
  }

  let totalIncome = summary.total_income;
  let totalExpense = summary.total_expense;
  let balance = summary.balance;
  let count = summary.transaction_count;
  const categoryExpenses = { ...summary.category_expenses };

  pending.forEach((item) => {
    const amount = item.payload.amount;
    count += 1;
    if (item.payload.type === 'income') {
      totalIncome = round2(totalIncome + amount);
      balance = round2(balance + amount);
    } else {
      totalExpense = round2(totalExpense + amount);
      balance = round2(balance - amount);
      categoryExpenses[item.payload.category] = round2(
        (categoryExpenses[item.payload.category] ?? 0) + amount,
      );
    }
  });

  return {
    ...summary,
    total_income: totalIncome,
    total_expense: totalExpense,
    balance,
    transaction_count: count,
    category_expenses: categoryExpenses,
  };
}
