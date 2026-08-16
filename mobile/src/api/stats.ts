import type { ApiResponse, MonthlySummary, NoteRankItem, TrendPoint } from '../types';
import client, { unwrap } from './client';

/** 分类默认配色(与 Web 端一致,图表/分类展示用)。 */
export const CATEGORY_COLORS: Record<string, string> = {
  餐饮: '#FF9500',
  交通: '#007AFF',
  日用: '#5856D6',
  娱乐: '#FF2D55',
  医疗: '#34C759',
  教育: '#5AC8FA',
  购物: '#AF52DE',
  零食: '#FF9500',
  收入: '#34C759',
  生活费: '#30D158',
  其他: '#8E8E93',
};

type SummaryTarget = 'self' | 'partner';

/** 备注统计的收支类型。 */
export type NoteType = 'income' | 'expense';

const formatMonth = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const shiftMonth = (value: Date, offset: number): Date =>
  new Date(value.getFullYear(), value.getMonth() + offset, 1);

export interface SummaryPeriodQuery {
  month: string;
  startDate?: string;
  endDate?: string;
}

const buildQueryParams = (
  period: string | SummaryPeriodQuery,
): Record<string, string> => {
  if (typeof period === 'string') {
    return { month: period };
  }
  return {
    month: period.month,
    ...(period.startDate ? { start_date: period.startDate } : {}),
    ...(period.endDate ? { end_date: period.endDate } : {}),
  };
};

export const fetchMonthlySummary = async (
  period: string | SummaryPeriodQuery,
): Promise<MonthlySummary> => {
  const response = await client.get<ApiResponse<MonthlySummary>>(
    '/stats/monthly-summary',
    { params: buildQueryParams(period) },
  );
  return unwrap(response.data);
};

export const fetchPartnerMonthlySummary = async (
  period: string | SummaryPeriodQuery,
): Promise<MonthlySummary> => {
  const response = await client.get<ApiResponse<MonthlySummary>>(
    '/stats/partner-summary',
    { params: buildQueryParams(period) },
  );
  return unwrap(response.data);
};

/** 取最近 N 个月的收支趋势序列。 */
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

/** 某月按备注聚合的金额排行(支出/收入,含笔数,金额降序 Top10)。 */
export const fetchNoteRanking = async (options: {
  month: string;
  target: SummaryTarget;
  type: NoteType;
}): Promise<NoteRankItem[]> => {
  const { month, target, type } = options;
  const response = await client.get<ApiResponse<NoteRankItem[]>>('/stats/notes', {
    params: { month, target, type },
  });
  return unwrap(response.data);
};

/** 某备注近 N 个月(截止 endMonth)的月度收支趋势。 */
export const fetchNoteTrend = async (options: {
  note: string;
  months: number;
  endMonth: Date;
  target: SummaryTarget;
}): Promise<TrendPoint[]> => {
  const { note, months, endMonth, target } = options;
  const response = await client.get<ApiResponse<TrendPoint[]>>('/stats/note-trend', {
    params: { note, months, end_month: formatMonth(endMonth), target },
  });
  return unwrap(response.data);
};
