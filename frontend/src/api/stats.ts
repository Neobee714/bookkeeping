import client from '@/api/client';
import type { ApiResponse, MonthlySummary, TrendPoint } from '@/types';

export const CATEGORY_COLORS: Record<string, string> = {
  餐饮: '#5A7A6E',
  交通: '#6B9E85',
  日用: '#C4A35A',
  娱乐: '#CC6B7E',
  医疗: '#5A8FBF',
  教育: '#7A9A3E',
  购物: '#A08548',
  其他: '#8A8580',
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

export const fetchTrend = async (months: number): Promise<TrendPoint[]> => {
  const response = await client.get<ApiResponse<TrendPoint[]>>('/stats/trend', {
    params: { months },
  });
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
