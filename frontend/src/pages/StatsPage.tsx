import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import {
  Cell,
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
import { useAuthStore } from '@/store/authStore';
import type { MonthlySummary, TrendPoint } from '@/types';

type SummaryTab = 'self' | 'partner';

const DEFAULT_COLOR = '#8E8E93';

const formatMonthKey = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const shiftMonth = (value: Date, offset: number): Date =>
  new Date(value.getFullYear(), value.getMonth() + offset, 1);

const formatShortMonth = (value: string): string => {
  const month = value.slice(5);
  return `${Number.parseInt(month, 10)}月`;
};

const formatTooltipNumber = (value: unknown): string => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  return numeric.toLocaleString();
};

const formatMoney = (value: number): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

function StatsPage() {
  const user = useAuthStore((state) => state.user);
  const partnerName = user?.partner?.nickname?.trim() || '伴侣';
  const showPartnerTab = Boolean(user?.partner?.nickname);

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
    if (!showPartnerTab && tab === 'partner') {
      setTab('self');
    }
  }, [showPartnerTab, tab]);

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

  const pieData =
    categoryRows.length > 0
      ? categoryRows
      : [{ name: '暂无支出', value: 1, color: '#E5E5EA' }];

  return (
    <section className="space-y-3 pb-2">
      <h1 className="ios-anim mb-1 mt-2 text-[34px] font-bold tracking-tight text-[#1C1C1E]">
        图表
      </h1>

      <div className="ios-glass ios-glass-strong ios-anim ios-anim-d1 p-4">
        <div className="mb-3 flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={() => setCurrentMonth((previous) => shiftMonth(previous, -1))}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgba(0,122,255,0.1)] text-[15px] font-semibold text-[#007AFF]"
            aria-label="上个月"
          >
            ‹
          </button>
          <span className="text-[17px] font-semibold text-[#1C1C1E]">{monthLabel}</span>
          <button
            type="button"
            onClick={() => setCurrentMonth((previous) => shiftMonth(previous, 1))}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgba(0,122,255,0.1)] text-[15px] font-semibold text-[#007AFF]"
            aria-label="下个月"
          >
            ›
          </button>
        </div>

        <div className="flex justify-between">
          <div className="flex-1 text-center">
            <p className="mb-1 text-xs font-medium text-[#8E8E93]">收入</p>
            <p className="text-[24px] font-bold tracking-tight text-[#34C759]">
              ¥ {formatMoney(summary?.total_income ?? 0)}
            </p>
          </div>
          <div className="flex-1 text-center">
            <p className="mb-1 text-xs font-medium text-[#8E8E93]">支出</p>
            <p className="text-[24px] font-bold tracking-tight text-[#FF3B30]">
              ¥ {formatMoney(summary?.total_expense ?? 0)}
            </p>
          </div>
        </div>
      </div>

      {showPartnerTab && (
        <div className="ios-segment ios-anim ios-anim-d2 flex">
          <button
            type="button"
            onClick={() => setTab('self')}
            className={`ios-segment-btn ${tab === 'self' ? 'active' : ''}`}
          >
            我的
          </button>
          <button
            type="button"
            onClick={() => setTab('partner')}
            className={`ios-segment-btn ${tab === 'partner' ? 'active' : ''}`}
          >
            {partnerName}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <div className="ios-glass h-48 animate-pulse" />
          <div className="ios-glass h-48 animate-pulse" />
        </div>
      ) : partnerUnavailable ? (
        <div className="ios-glass ios-anim ios-anim-d3 px-4 py-10 text-center text-sm text-[#8E8E93]">
          还没有绑定伴侣
        </div>
      ) : errorMessage ? (
        <div className="ios-glass ios-anim ios-anim-d3 px-4 py-3 text-sm text-[#FF3B30]">
          {errorMessage}
        </div>
      ) : summary ? (
        <>
          <div className="ios-glass ios-anim ios-anim-d3 p-4">
            <div className="mb-3 text-[15px] font-semibold text-[#1C1C1E]">支出分布</div>
            <div className="relative flex h-[180px] items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={1.5}
                    stroke="none"
                  >
                    {pieData.map((entry) => (
                      <Cell key={`pie-${entry.name}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown) => formatTooltipNumber(value)}
                    separator="："
                    contentStyle={{
                      borderRadius: 12,
                      border: '0.5px solid rgba(60,60,67,0.12)',
                      background: 'rgba(255,255,255,0.92)',
                      backdropFilter: 'blur(12px)',
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-[#8E8E93]">总计</span>
                <span className="mt-0.5 text-[13px] font-semibold text-[#1C1C1E]">
                  ¥{formatMoney(summary.total_expense)}
                </span>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2.5">
              {categoryRows.length === 0 ? (
                <div className="col-span-2 py-3 text-center text-xs text-[#8E8E93]">
                  本月暂无支出
                </div>
              ) : (
                categoryRows.map((item) => (
                  <div key={item.name} className="flex items-center gap-2 text-[13px] text-[#1C1C1E]">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ background: item.color }}
                    />
                    <span>{item.name}</span>
                    <span className="ml-auto text-xs text-[#8E8E93]">
                      ¥{formatMoney(item.value)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="ios-glass ios-anim ios-anim-d4 p-4">
            <div className="mb-2 text-[15px] font-semibold text-[#1C1C1E]">月度趋势</div>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatShortMonth}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#8E8E93' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#8E8E93' }}
                    tickFormatter={(value: number) => value.toLocaleString()}
                    width={40}
                  />
                  <Tooltip
                    formatter={(value: unknown) => formatTooltipNumber(value)}
                    labelFormatter={(value: unknown) => `月份：${String(value ?? '')}`}
                    contentStyle={{
                      borderRadius: 12,
                      border: '0.5px solid rgba(60,60,67,0.12)',
                      background: 'rgba(255,255,255,0.92)',
                      backdropFilter: 'blur(12px)',
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="income"
                    stroke="#34C759"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#34C759', stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                    name="收入"
                  />
                  <Line
                    type="monotone"
                    dataKey="expense"
                    stroke="#007AFF"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#007AFF', stroke: '#fff', strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                    name="支出"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex items-center justify-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-[#1C1C1E]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#34C759]" />
                收入
              </span>
              <span className="flex items-center gap-1.5 text-[#1C1C1E]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#007AFF]" />
                支出
              </span>
            </div>
          </div>

          <div className="ios-glass ios-anim ios-anim-d5 p-4">
            <div className="mb-3 text-[15px] font-semibold text-[#1C1C1E]">本月指标</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[rgba(118,118,128,0.06)] p-3">
                <p className="text-xs text-[#8E8E93]">结余</p>
                <p className="mt-1 text-[17px] font-semibold text-[#1C1C1E]">
                  ¥ {formatMoney(summary.balance)}
                </p>
              </div>
              <div className="rounded-xl bg-[rgba(118,118,128,0.06)] p-3">
                <p className="text-xs text-[#8E8E93]">记录笔数</p>
                <p className="mt-1 text-[17px] font-semibold text-[#1C1C1E]">
                  {summary.transaction_count.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default StatsPage;
