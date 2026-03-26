import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import {
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  CATEGORY_COLORS,
  fetchMonthlySummary,
  fetchMonthlyTrendSeries,
  fetchPartnerMonthlySummary,
} from '@/api/stats';
import type { MonthlySummary, TrendPoint } from '@/types';

type SummaryTab = 'self' | 'partner';

const DEFAULT_COLOR = '#C0BECF';

const formatMonthKey = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const shiftMonth = (value: Date, offset: number): Date =>
  new Date(value.getFullYear(), value.getMonth() + offset, 1);

const formatShortMonth = (value: string): string => value.slice(5);
const formatTooltipNumber = (value: unknown): string => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  return numeric.toLocaleString();
};

function StatsPage() {
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [tab, setTab] = useState<SummaryTab>('self');
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [partnerUnavailable, setPartnerUnavailable] = useState(false);

  const monthKey = useMemo(() => formatMonthKey(currentMonth), [currentMonth]);
  const monthLabel = useMemo(
    () => currentMonth.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }),
    [currentMonth],
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      setPartnerUnavailable(false);
      try {
        if (tab === 'partner') {
          const [partnerSummary, partnerTrend] = await Promise.all([
            fetchPartnerMonthlySummary(monthKey),
            fetchMonthlyTrendSeries({
              target: 'partner',
              months: 6,
              endMonth: currentMonth,
            }),
          ]);
          setSummary(partnerSummary);
          setTrend(partnerTrend);
        } else {
          const [selfSummary, selfTrend] = await Promise.all([
            fetchMonthlySummary(monthKey),
            fetchMonthlyTrendSeries({
              target: 'self',
              months: 6,
              endMonth: currentMonth,
            }),
          ]);
          setSummary(selfSummary);
          setTrend(selfTrend);
        }
      } catch (error) {
        setSummary(null);
        setTrend([]);
        if (
          tab === 'partner' &&
          axios.isAxiosError(error) &&
          error.response?.status === 403
        ) {
          setPartnerUnavailable(true);
          return;
        }
        if (axios.isAxiosError(error)) {
          setErrorMessage(error.response?.data?.message ?? '统计数据加载失败');
          return;
        }
        if (error instanceof Error) {
          setErrorMessage(error.message);
          return;
        }
        setErrorMessage('统计数据加载失败');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [tab, monthKey, currentMonth]);

  const categoryRows = useMemo(() => {
    if (!summary) {
      return [] as Array<{ name: string; value: number; color: string }>;
    }
    return Object.entries(summary.category_expenses)
      .map(([name, value]) => ({
        name,
        value,
        color: CATEGORY_COLORS[name] ?? DEFAULT_COLOR,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [summary]);

  const topCategoryAmount = categoryRows[0]?.value ?? 0;
  const pieData =
    categoryRows.length > 0
      ? categoryRows
      : [{ name: '暂无支出', value: 1, color: '#E7E5F2' }];

  return (
    <section className="space-y-4 pb-4">
      <header className="space-y-3 rounded-2xl border border-[#EEEDFE] bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-[10px] border border-[#EAE8F5] bg-white px-2 py-1">
            <button
              type="button"
              onClick={() => setCurrentMonth((previous) => shiftMonth(previous, -1))}
              className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[#6F6A7E] hover:bg-[#F2F0FB]"
            >
              ‹
            </button>
            <span className="min-w-[102px] text-center text-sm font-medium text-[#534AB7]">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => setCurrentMonth((previous) => shiftMonth(previous, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[#6F6A7E] hover:bg-[#F2F0FB]"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-2 rounded-[10px] bg-[#F4F2FD] p-1">
            <button
              type="button"
              onClick={() => setTab('self')}
              className={`h-8 rounded-[10px] px-4 text-xs ${
                tab === 'self' ? 'bg-white text-[#534AB7]' : 'text-[#8A8799]'
              }`}
            >
              我
            </button>
            <button
              type="button"
              onClick={() => setTab('partner')}
              className={`h-8 rounded-[10px] px-4 text-xs ${
                tab === 'partner' ? 'bg-white text-[#534AB7]' : 'text-[#8A8799]'
              }`}
            >
              伴侣
            </button>
          </div>
        </div>

        <p className="text-xs text-[#8A8799]">统计月份：{monthKey}</p>
      </header>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`stats-skeleton-${index}`}
              className="h-24 animate-pulse rounded-2xl border border-[#EEEDFE] bg-[#F8F7FE]"
            />
          ))}
        </div>
      ) : partnerUnavailable ? (
        <div className="rounded-2xl border border-[#EEEDFE] bg-[#F8F7FE] px-4 py-10 text-center text-sm text-[#8A8799]">
          还没有绑定伴侣
        </div>
      ) : errorMessage ? (
        <div className="rounded-2xl border border-[#F7D6D6] bg-[#FFF7F7] px-4 py-3 text-sm text-[#E24B4A]">
          {errorMessage}
        </div>
      ) : summary ? (
        <>
          <section className="grid grid-cols-2 gap-3">
            <article className="rounded-2xl border border-[#F8D8D7] bg-white p-3">
              <p className="text-xs text-[#8A8799]">总支出</p>
              <p className="mt-2 text-lg font-semibold text-[#E24B4A]">
                {summary.total_expense.toLocaleString()}
              </p>
            </article>
            <article className="rounded-2xl border border-[#D8EFE5] bg-white p-3">
              <p className="text-xs text-[#8A8799]">总收入</p>
              <p className="mt-2 text-lg font-semibold text-[#1D9E75]">
                {summary.total_income.toLocaleString()}
              </p>
            </article>
            <article className="rounded-2xl border border-[#E7E2FF] bg-white p-3">
              <p className="text-xs text-[#8A8799]">结余</p>
              <p className="mt-2 text-lg font-semibold text-[#534AB7]">
                {summary.balance.toLocaleString()}
              </p>
            </article>
            <article className="rounded-2xl border border-[#ECEAF5] bg-white p-3">
              <p className="text-xs text-[#8A8799]">记录笔数</p>
              <p className="mt-2 text-lg font-semibold text-[#787488]">
                {summary.transaction_count.toLocaleString()}
              </p>
            </article>
          </section>

          <section className="rounded-2xl border border-[#EEEDFE] bg-white p-3">
            <p className="mb-2 text-sm font-semibold text-[#2D2940]">分类支出饼图</p>
            <div className="relative">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell key={`pie-${entry.name}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown) => formatTooltipNumber(value)}
                    separator="："
                  />
                  <Legend
                    verticalAlign="bottom"
                    formatter={(value) => (
                      <span className="text-xs text-[#6F6A7E]">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-[#8A8799]">总支出</span>
                <span className="mt-1 text-sm font-semibold text-[#E24B4A]">
                  {summary.total_expense.toLocaleString()}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#EEEDFE] bg-white p-3">
            <p className="mb-2 text-sm font-semibold text-[#2D2940]">近6个月收支趋势</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend}>
                <XAxis
                  dataKey="month"
                  tickFormatter={formatShortMonth}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#8A8799' }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#8A8799' }}
                  tickFormatter={(value: number) => value.toLocaleString()}
                />
                <Tooltip
                  formatter={(value: unknown) => formatTooltipNumber(value)}
                  labelFormatter={(value: unknown) => `月份：${String(value ?? '')}`}
                />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke="#1D9E75"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="expense"
                  stroke="#E24B4A"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </section>

          <section className="rounded-2xl border border-[#EEEDFE] bg-white p-3">
            <p className="mb-3 text-sm font-semibold text-[#2D2940]">本月分类支出排行</p>

            {categoryRows.length === 0 ? (
              <p className="rounded-[10px] bg-[#F8F7FE] px-3 py-6 text-center text-sm text-[#8A8799]">
                本月暂无支出记录
              </p>
            ) : (
              <ul className="space-y-3">
                {categoryRows.map((item) => {
                  const percent = topCategoryAmount > 0 ? (item.value / topCategoryAmount) * 100 : 0;
                  return (
                    <li key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#5C5870]">{item.name}</span>
                        <span className="font-medium text-[#2D2940]">
                          {item.value.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[#ECEAF6]">
                        <div
                          className="h-2 rounded-full bg-[#534AB7]"
                          style={{ width: `${Math.max(percent, 4)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}

export default StatsPage;
