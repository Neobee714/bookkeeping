import client from '@/api/client';
import type { ApiResponse, MonthlySummary, TrendPoint } from '@/types';

export const CATEGORY_COLORS: Record<string, string> = {
  餐饮: '#FF9500',
  交通: '#007AFF',
  日用: '#5856D6',
  娱乐: '#FF2D55',
  医疗: '#34C759',
  教育: '#5AC8FA',
  购物: '#AF52DE',
  其他: '#8E8E93',
};

type SummaryTarget = 'self' | 'partner';

const assertSuccess = <T>(response: ApiResponse<T>): T => {
  if (!response.success) {
    throw new Error(response.message || '请求失败');
  }
  return response.data;
};

const formatMonth = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const shiftMonth = (value: Date, offset: number): Date =>
  new Date(value.getFullYear(), value.getMonth() + offset, 1);

export const fetchMonthlySummary = async (
  month: string,
): Promise<MonthlySummary> => {
  const response = await client.get<ApiResponse<MonthlySummary>>(
    '/stats/monthly-summary',
    {
      params: { month },
    },
  );
  return assertSuccess(response.data);
};

export const fetchPartnerMonthlySummary = async (
  month: string,
): Promise<MonthlySummary> => {
  const response = await client.get<ApiResponse<MonthlySummary>>(
    '/stats/partner-summary',
    {
      params: { month },
    },
  );
  return assertSuccess(response.data);
};

export const fetchMonthlyTrendSeries = async (options: {
  target: SummaryTarget;
  months: number;
  endMonth: Date;
}): Promise<TrendPoint[]> => {
  const { target, months, endMonth } = options;
  const monthKeys = Array.from({ length: months }, (_, index) =>
    formatMonth(shiftMonth(endMonth, -(months - 1 - index))),
  );

  const loader =
    target === 'partner' ? fetchPartnerMonthlySummary : fetchMonthlySummary;

  const summaries = await Promise.all(monthKeys.map((key) => loader(key)));
  return summaries.map((summary) => ({
    month: summary.month,
    income: summary.total_income,
    expense: summary.total_expense,
    balance: summary.balance,
  }));
};
