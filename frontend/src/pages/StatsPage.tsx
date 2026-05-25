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
  fetchMonthlySummary,
  fetchMonthlyTrendSeries,
  fetchPartnerMonthlySummary,
} from '@/api/stats';
import { useAuthStore } from '@/store/authStore';
import { useCategoryStore } from '@/store/categoryStore';
import { useTransactionSyncStore } from '@/store/transactionSyncStore';
import type { MonthlySummary, NoteBreakdownEntry, TrendPoint } from '@/types';
import { useCachedResource } from '@/utils/useCachedResource';

type SummaryTab = 'self' | 'partner';

const EMPTY_SLICE_COLOR = '#E5E5EA';
const UNLABELED_NOTE = '未备注';

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

interface TopNoteItem extends NoteBreakdownEntry {
  category: string;
  color: string;
}

function StatsPage() {
  const user = useAuthStore((state) => state.user);
  const partnerName = user?.partner?.nickname?.trim() || '伴侣';
  const showPartnerTab = Boolean(user?.partner?.nickname);
  const refreshVersion = useTransactionSyncStore((state) => state.refreshVersion);
  const { loaded: categoriesLoaded, fetchCategories, getCategoryColor } = useCategoryStore();

  useEffect(() => {
    if (!categoriesLoaded) {
      void fetchCategories();
    }
  }, [categoriesLoaded, fetchCategories]);

  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [tab, setTab] = useState<SummaryTab>('self');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const monthKey = useMemo(() => formatMonthKey(currentMonth), [currentMonth]);
  const monthLabel = useMemo(
    () => currentMonth.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }),
    [currentMonth],
  );

  const summaryResource = useCachedResource<MonthlySummary>(
    `stats-sum:${tab}:${monthKey}`,
    () => (tab === 'partner' ? fetchPartnerMonthlySummary(monthKey) : fetchMonthlySummary(monthKey)),
    [tab, monthKey, refreshVersion],
  );
  const trendResource = useCachedResource<TrendPoint[]>(
    `stats-trend:${tab}:${monthKey}`,
    () =>
      fetchMonthlyTrendSeries({
        target: tab === 'partner' ? 'partner' : 'self',
        months: 6,
        endMonth: currentMonth,
      }),
    [tab, monthKey, refreshVersion],
  );

  const summary = summaryResource.data ?? null;
  const trend = trendResource.data ?? [];
  const loading = summaryResource.loading || trendResource.loading;
  const error = summaryResource.error ?? trendResource.error;
  const partnerUnavailable =
    tab === 'partner' && axios.isAxiosError(error) && error.response?.status === 403;
  const errorMessage = error && !partnerUnavailable
    ? axios.isAxiosError(error)
      ? error.response?.data?.message ?? '统计数据加载失败'
      : error.message
    : '';

  useEffect(() => {
    if (!showPartnerTab && tab === 'partner') {
      setTab('self');
    }
  }, [showPartnerTab, tab]);

  // Reset the drill-down when the data source changes.
  useEffect(() => {
    setSelectedCategory(null);
  }, [tab, monthKey]);

  const categoryRows = useMemo(() => {
    if (!summary) {
      return [] as Array<{ name: string; value: number; color: string }>;
    }
    return Object.entries(summary.category_expenses)
      .map(([name, value]) => ({
        name,
        value,
        color: getCategoryColor(name),
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [summary]);

  const pieData =
    categoryRows.length > 0
      ? categoryRows
      : [{ name: '暂无支出', value: 1, color: EMPTY_SLICE_COLOR }];

  // Resolve the active category – either user-selected or the biggest slice.
  const activeCategory = useMemo(() => {
    if (categoryRows.length === 0) {
      return null;
    }
    if (selectedCategory) {
      const match = categoryRows.find((row) => row.name === selectedCategory);
      if (match) {
        return match;
      }
    }
    return categoryRows[0];
  }, [categoryRows, selectedCategory]);

  const noteEntriesForActive = useMemo<NoteBreakdownEntry[]>(() => {
    if (!summary || !activeCategory) {
      return [];
    }
    return summary.note_breakdown?.[activeCategory.name] ?? [];
  }, [summary, activeCategory]);

  const topNotes = useMemo<TopNoteItem[]>(() => {
    if (!summary?.note_breakdown) {
      return [];
    }
    const flat: TopNoteItem[] = [];
    Object.entries(summary.note_breakdown).forEach(([category, entries]) => {
      const color = getCategoryColor(category);
      entries.forEach((entry) => {
        if (entry.amount > 0) {
          flat.push({ ...entry, category, color });
        }
      });
    });
    return flat.sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [summary]);

  const topNoteMax = topNotes[0]?.amount ?? 0;
  const activeNoteMax = noteEntriesForActive[0]?.amount ?? 0;

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

      {loading && !summary ? (
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
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[15px] font-semibold text-[#1C1C1E]">支出分布</div>
              {categoryRows.length > 0 && (
                <div className="text-[11px] text-[#8E8E93]">点击查看备注明细</div>
              )}
            </div>

            <div className="relative flex h-[200px] items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={82}
                    paddingAngle={1.5}
                    stroke="none"
                    onClick={(slice: { name?: string }) => {
                      if (categoryRows.length === 0 || !slice?.name) {
                        return;
                      }
                      setSelectedCategory(slice.name);
                    }}
                  >
                    {pieData.map((entry) => {
                      const isActive =
                        categoryRows.length > 0 && entry.name === activeCategory?.name;
                      return (
                        <Cell
                          key={`pie-${entry.name}`}
                          fill={entry.color}
                          opacity={
                            categoryRows.length === 0 || isActive ? 1 : 0.55
                          }
                          style={{
                            cursor: categoryRows.length > 0 ? 'pointer' : 'default',
                            transition: 'opacity 0.2s',
                          }}
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                {activeCategory ? (
                  <>
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: activeCategory.color }}
                    >
                      {activeCategory.name}
                    </span>
                    <span className="mt-0.5 text-[15px] font-semibold text-[#1C1C1E]">
                      ¥{formatMoney(activeCategory.value)}
                    </span>
                    <span className="mt-0.5 text-[10px] text-[#8E8E93]">
                      占比{' '}
                      {summary.total_expense > 0
                        ? ((activeCategory.value / summary.total_expense) * 100).toFixed(0)
                        : 0}
                      %
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-[#8E8E93]">总计</span>
                    <span className="mt-0.5 text-[13px] font-semibold text-[#1C1C1E]">
                      ¥{formatMoney(summary.total_expense)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {categoryRows.length === 0 ? (
                <div className="w-full py-3 text-center text-xs text-[#8E8E93]">
                  本月暂无支出
                </div>
              ) : (
                categoryRows.map((item) => {
                  const isActive = item.name === activeCategory?.name;
                  return (
                    <button
                      type="button"
                      key={item.name}
                      onClick={() => setSelectedCategory(item.name)}
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition"
                      style={{
                        background: isActive
                          ? `${item.color}22`
                          : 'rgba(118,118,128,0.08)',
                        color: isActive ? item.color : '#1C1C1E',
                        fontWeight: isActive ? 600 : 500,
                      }}
                    >
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ background: item.color }}
                      />
                      <span>{item.name}</span>
                      <span className="text-[11px] opacity-80">
                        ¥{formatMoney(item.value)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {activeCategory && (
            <div className="ios-glass ios-anim ios-anim-d4 p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: activeCategory.color }}
                  />
                  <span className="text-[15px] font-semibold text-[#1C1C1E]">
                    {activeCategory.name} · 备注明细
                  </span>
                </div>
                <span className="text-[11px] text-[#8E8E93]">
                  {noteEntriesForActive.length} 项
                </span>
              </div>

              {noteEntriesForActive.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#8E8E93]">暂无明细</div>
              ) : (
                <div className="space-y-2.5">
                  {noteEntriesForActive.map((entry) => {
                    const ratio =
                      activeNoteMax > 0 ? (entry.amount / activeNoteMax) * 100 : 0;
                    const isUnlabeled = entry.note === UNLABELED_NOTE;
                    return (
                      <div key={`${activeCategory.name}-${entry.note}`}>
                        <div className="mb-1 flex items-baseline justify-between text-[13px]">
                          <span
                            className={
                              isUnlabeled
                                ? 'text-[#8E8E93] italic'
                                : 'text-[#1C1C1E]'
                            }
                          >
                            {entry.note}
                            {entry.count > 1 && (
                              <span className="ml-1 text-[11px] text-[#8E8E93]">
                                ×{entry.count}
                              </span>
                            )}
                          </span>
                          <span className="font-semibold text-[#1C1C1E]">
                            ¥{formatMoney(entry.amount)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(118,118,128,0.1)]">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(ratio, 4)}%`,
                              background: activeCategory.color,
                              opacity: isUnlabeled ? 0.4 : 1,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {topNotes.length > 0 && (
            <div className="ios-glass ios-anim ios-anim-d5 p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-[15px] font-semibold text-[#1C1C1E]">
                  花钱最多的备注
                </span>
                <span className="text-[11px] text-[#8E8E93]">TOP {topNotes.length}</span>
              </div>
              <div className="space-y-2.5">
                {topNotes.map((entry, index) => {
                  const ratio =
                    topNoteMax > 0 ? (entry.amount / topNoteMax) * 100 : 0;
                  const isUnlabeled = entry.note === UNLABELED_NOTE;
                  return (
                    <div key={`${entry.category}-${entry.note}-${index}`}>
                      <div className="mb-1 flex items-baseline justify-between text-[13px]">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                            style={{ background: entry.color }}
                          >
                            {index + 1}
                          </span>
                          <span
                            className={
                              isUnlabeled
                                ? 'text-[#8E8E93] italic'
                                : 'text-[#1C1C1E]'
                            }
                          >
                            {entry.note}
                          </span>
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px]"
                            style={{
                              background: `${entry.color}1A`,
                              color: entry.color,
                            }}
                          >
                            {entry.category}
                          </span>
                        </span>
                        <span className="font-semibold text-[#1C1C1E]">
                          ¥{formatMoney(entry.amount)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(118,118,128,0.1)]">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(ratio, 4)}%`,
                            background: entry.color,
                            opacity: isUnlabeled ? 0.4 : 1,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="ios-glass ios-anim ios-anim-d5 p-4">
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
