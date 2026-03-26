import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';

import { fetchBudget, setBudget, updateBudget } from '@/api/budget';
import { createSaving, deleteSaving, fetchSavings, updateSaving } from '@/api/savings';
import type {
  Budget,
  BudgetSummary,
  Category,
  SavingsCreatePayload,
  SavingsGoal,
  SavingsUpdatePayload,
} from '@/types';

type PlanTab = 'budget' | 'savings';

const categoryMeta: Array<{ category: Category; emoji: string }> = [
  { category: '餐饮', emoji: '🍜' },
  { category: '交通', emoji: '🚇' },
  { category: '日用', emoji: '🛒' },
  { category: '娱乐', emoji: '🎮' },
  { category: '医疗', emoji: '💊' },
  { category: '教育', emoji: '📚' },
  { category: '购物', emoji: '🛍️' },
  { category: '收入', emoji: '💰' },
  { category: '其他', emoji: '📌' },
];

const getMonthKey = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const shiftMonth = (value: Date, delta: number): Date =>
  new Date(value.getFullYear(), value.getMonth() + delta, 1);

const parseAmount = (value: string): number | null => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Number(parsed.toFixed(2));
};

const formatCurrency = (value: number): string =>
  `¥ ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const getProgressInfo = (spent: number, limit: number) => {
  if (limit <= 0) {
    if (spent > 0) {
      return {
        percent: 100,
        rate: Number.POSITIVE_INFINITY,
        color: '#E24B4A',
      };
    }
    return { percent: 0, rate: 0, color: '#534AB7' };
  }
  const rate = spent / limit;
  const percent = Math.min(rate * 100, 100);
  const color = rate > 1 ? '#E24B4A' : rate >= 0.8 ? '#EF9F27' : '#534AB7';
  return { percent, rate, color };
};

interface SavingsCardProps {
  goal: SavingsGoal;
  onLongPress: (goal: SavingsGoal) => void;
}

function SavingsCard({ goal, onLongPress }: SavingsCardProps) {
  const timerRef = useRef<number | null>(null);

  const progress = goal.target_amount > 0 ? Math.min(goal.current_amount / goal.target_amount, 1) : 0;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const percent = Math.round(progress * 100);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startPress = () => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      onLongPress(goal);
    }, 450);
  };

  const stopPress = () => {
    clearTimer();
  };

  const deadlineText = goal.deadline
    ? new Date(goal.deadline).toLocaleDateString('zh-CN')
    : '未设置';

  return (
    <article
      role="button"
      tabIndex={0}
      onMouseDown={startPress}
      onMouseUp={stopPress}
      onMouseLeave={stopPress}
      onTouchStart={startPress}
      onTouchEnd={stopPress}
      onTouchCancel={stopPress}
      className="rounded-2xl border border-[#EEEDFE] bg-white p-4 text-left"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-[#2D2940]">{goal.name}</p>
          <p className="mt-1 text-sm text-[#8A8799]">
            {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
          </p>
          <p className="mt-2 text-xs text-[#8A8799]">预计完成日期：{deadlineText}</p>
          <p className="mt-2 text-xs text-[#8A8799]">长按可更新进度</p>
        </div>

        <div className="relative h-20 w-20">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={radius} fill="none" stroke="#ECEAF6" strokeWidth="8" />
            <circle
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke="#534AB7"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-[#534AB7]">
            {percent}%
          </div>
        </div>
      </div>
    </article>
  );
}

function PlanPage() {
  const [tab, setTab] = useState<PlanTab>('budget');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [loadingBudget, setLoadingBudget] = useState(true);
  const [loadingSavings, setLoadingSavings] = useState(true);
  const [budgetError, setBudgetError] = useState('');
  const [savingsError, setSavingsError] = useState('');

  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [budgetCategory, setBudgetCategory] = useState<Category>('餐饮');
  const [budgetLimitInput, setBudgetLimitInput] = useState('');

  const [savingSheetOpen, setSavingSheetOpen] = useState(false);
  const [editingSaving, setEditingSaving] = useState<SavingsGoal | null>(null);
  const [savingName, setSavingName] = useState('');
  const [savingTargetInput, setSavingTargetInput] = useState('');
  const [savingCurrentInput, setSavingCurrentInput] = useState('');
  const [savingDeadline, setSavingDeadline] = useState('');
  const [savingDeleting, setSavingDeleting] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState('');

  const monthKey = useMemo(() => getMonthKey(month), [month]);
  const monthLabel = useMemo(
    () => month.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' }),
    [month],
  );

  const loadBudget = async () => {
    setLoadingBudget(true);
    setBudgetError('');
    try {
      const data = await fetchBudget(monthKey);
      const known = new Map<Category, Budget>();
      data.items.forEach((item) => {
        known.set(item.category, item);
      });
      const mergedItems = categoryMeta
        .map((meta) => {
          const existing = known.get(meta.category);
          if (existing) {
            return existing;
          }
          return {
            id: null,
            user_id: 0,
            category: meta.category,
            monthly_limit: 0,
            year_month: monthKey,
            actual_spent: 0,
            remaining: 0,
            created_at: null,
          } satisfies Budget;
        });

      const total_budget = mergedItems.reduce((sum, item) => sum + item.monthly_limit, 0);
      const total_spent = mergedItems.reduce((sum, item) => sum + item.actual_spent, 0);

      setBudgetSummary({
        month: monthKey,
        items: mergedItems,
        total_budget,
        total_spent,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setBudgetError(error.response?.data?.message ?? '预算加载失败');
      } else if (error instanceof Error) {
        setBudgetError(error.message);
      } else {
        setBudgetError('预算加载失败');
      }
    } finally {
      setLoadingBudget(false);
    }
  };

  const loadSavings = async () => {
    setLoadingSavings(true);
    setSavingsError('');
    try {
      const data = await fetchSavings();
      setSavingsGoals(data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setSavingsError(error.response?.data?.message ?? '储蓄目标加载失败');
      } else if (error instanceof Error) {
        setSavingsError(error.message);
      } else {
        setSavingsError('储蓄目标加载失败');
      }
    } finally {
      setLoadingSavings(false);
    }
  };

  useEffect(() => {
    void loadBudget();
  }, [monthKey]);

  useEffect(() => {
    void loadSavings();
  }, []);

  const openCreateBudgetSheet = () => {
    setEditingBudget(null);
    setBudgetCategory('餐饮');
    setBudgetLimitInput('');
    setSheetError('');
    setBudgetSheetOpen(true);
  };

  const openEditBudgetSheet = (item: Budget) => {
    setEditingBudget(item);
    setBudgetCategory(item.category);
    setBudgetLimitInput(item.monthly_limit > 0 ? String(item.monthly_limit) : '');
    setSheetError('');
    setBudgetSheetOpen(true);
  };

  const openCreateSavingSheet = () => {
    setEditingSaving(null);
    setSavingName('');
    setSavingTargetInput('');
    setSavingCurrentInput('');
    setSavingDeadline('');
    setSavingDeleting(false);
    setSheetError('');
    setSavingSheetOpen(true);
  };

  const openEditSavingSheet = (goal: SavingsGoal) => {
    setEditingSaving(goal);
    setSavingName(goal.name);
    setSavingTargetInput(String(goal.target_amount));
    setSavingCurrentInput(String(goal.current_amount));
    setSavingDeadline(goal.deadline ?? '');
    setSavingDeleting(false);
    setSheetError('');
    setSavingSheetOpen(true);
  };

  const handleSubmitBudget = async () => {
    if (submitting) {
      return;
    }
    const amount = parseAmount(budgetLimitInput);
    if (!amount) {
      setSheetError('请输入有效预算金额');
      return;
    }

    setSubmitting(true);
    setSheetError('');
    try {
      if (editingBudget?.id) {
        await updateBudget(editingBudget.id, {
          category: budgetCategory,
          monthly_limit: amount,
          year_month: monthKey,
        });
      } else {
        await setBudget({
          category: budgetCategory,
          monthly_limit: amount,
          year_month: monthKey,
        });
      }
      setBudgetSheetOpen(false);
      await loadBudget();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setSheetError(error.response?.data?.message ?? '预算保存失败');
      } else if (error instanceof Error) {
        setSheetError(error.message);
      } else {
        setSheetError('预算保存失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitSaving = async () => {
    if (submitting) {
      return;
    }
    const targetAmount = parseAmount(savingTargetInput);
    const currentAmount = Number.parseFloat(savingCurrentInput || '0');
    if (!savingName.trim()) {
      setSheetError('请输入目标名称');
      return;
    }
    if (!targetAmount) {
      setSheetError('请输入有效目标金额');
      return;
    }
    if (!Number.isFinite(currentAmount) || currentAmount < 0) {
      setSheetError('当前金额不正确');
      return;
    }

    setSubmitting(true);
    setSheetError('');
    try {
      if (editingSaving) {
        const payload: SavingsUpdatePayload = {
          name: savingName.trim(),
          target_amount: targetAmount,
          current_amount: Number(currentAmount.toFixed(2)),
          deadline: savingDeadline || null,
        };
        await updateSaving(editingSaving.id, payload);
      } else {
        const payload: SavingsCreatePayload = {
          name: savingName.trim(),
          target_amount: targetAmount,
          current_amount: Number(currentAmount.toFixed(2)),
          deadline: savingDeadline || null,
        };
        await createSaving(payload);
      }
      setSavingSheetOpen(false);
      await loadSavings();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setSheetError(error.response?.data?.message ?? '储蓄目标保存失败');
      } else if (error instanceof Error) {
        setSheetError(error.message);
      } else {
        setSheetError('储蓄目标保存失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSaving = async () => {
    if (!editingSaving || submitting) {
      return;
    }
    const confirmed = window.confirm(`确定删除目标「${editingSaving.name}」吗？`);
    if (!confirmed) {
      return;
    }
    setSubmitting(true);
    setSavingDeleting(true);
    setSheetError('');
    try {
      await deleteSaving(editingSaving.id);
      setSavingSheetOpen(false);
      await loadSavings();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setSheetError(error.response?.data?.message ?? '删除失败');
      } else if (error instanceof Error) {
        setSheetError(error.message);
      } else {
        setSheetError('删除失败');
      }
    } finally {
      setSubmitting(false);
      setSavingDeleting(false);
    }
  };

  const budgetOverview = useMemo(() => {
    if (!budgetSummary) {
      return { percent: 0, color: '#534AB7' };
    }
    return getProgressInfo(budgetSummary.total_spent, budgetSummary.total_budget);
  }, [budgetSummary]);

  return (
    <section className="space-y-4 pb-4">
      <header className="rounded-2xl border border-[#EEEDFE] bg-white p-3">
        <div className="grid grid-cols-2 rounded-[10px] bg-[#F4F2FD] p-1">
          <button
            type="button"
            onClick={() => setTab('budget')}
            className={`h-9 rounded-[10px] text-sm ${
              tab === 'budget' ? 'bg-white text-[#534AB7]' : 'text-[#8A8799]'
            }`}
          >
            预算
          </button>
          <button
            type="button"
            onClick={() => setTab('savings')}
            className={`h-9 rounded-[10px] text-sm ${
              tab === 'savings' ? 'bg-white text-[#534AB7]' : 'text-[#8A8799]'
            }`}
          >
            储蓄
          </button>
        </div>

        {tab === 'budget' && (
          <div className="mt-3 flex items-center justify-between rounded-[10px] border border-[#EAE8F5] px-2 py-1">
            <button
              type="button"
              onClick={() => setMonth((previous) => shiftMonth(previous, -1))}
              className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[#6F6A7E] hover:bg-[#F2F0FB]"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-[#534AB7]">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setMonth((previous) => shiftMonth(previous, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[#6F6A7E] hover:bg-[#F2F0FB]"
            >
              ›
            </button>
          </div>
        )}
      </header>

      {tab === 'budget' ? (
        <>
          {loadingBudget ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`budget-skeleton-${index}`}
                  className="h-24 animate-pulse rounded-2xl border border-[#EEEDFE] bg-[#F8F7FE]"
                />
              ))}
            </div>
          ) : budgetError ? (
            <div className="rounded-2xl border border-[#F7D6D6] bg-[#FFF7F7] px-4 py-3 text-sm text-[#E24B4A]">
              {budgetError}
            </div>
          ) : budgetSummary ? (
            <>
              <section className="rounded-2xl border border-[#EEEDFE] bg-white p-4">
                <p className="text-sm text-[#8A8799]">本月预算使用情况</p>
                <p className="mt-2 text-lg font-semibold text-[#2D2940]">
                  {formatCurrency(budgetSummary.total_spent)} / {formatCurrency(budgetSummary.total_budget)}
                </p>
                <div className="mt-3 h-2 rounded-full bg-[#ECEAF6]">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${budgetOverview.percent}%`,
                      backgroundColor: budgetOverview.color,
                    }}
                  />
                </div>
              </section>

              <section className="space-y-3">
                {budgetSummary.items.map((item) => {
                  const meta = categoryMeta.find((entry) => entry.category === item.category);
                  const progress = getProgressInfo(item.actual_spent, item.monthly_limit);
                  const overspend = item.monthly_limit > 0 ? item.actual_spent - item.monthly_limit : 0;
                  return (
                    <button
                      type="button"
                      key={`${item.category}-${item.id ?? 'new'}`}
                      onClick={() => openEditBudgetSheet(item)}
                      className="w-full rounded-2xl border border-[#EEEDFE] bg-white p-4 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[#2D2940]">
                          {meta?.emoji} {item.category}
                        </p>
                        <p className="text-xs text-[#8A8799]">
                          {formatCurrency(item.actual_spent)} / {formatCurrency(item.monthly_limit)}
                        </p>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-[#ECEAF6]">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${progress.percent}%`,
                            backgroundColor: progress.color,
                          }}
                        />
                      </div>
                      {overspend > 0 ? (
                        <p className="mt-2 text-xs font-medium text-[#E24B4A]">
                          超支 {formatCurrency(overspend)}
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-[#8A8799]">
                          剩余 {formatCurrency(Math.max(item.monthly_limit - item.actual_spent, 0))}
                        </p>
                      )}
                    </button>
                  );
                })}
              </section>
            </>
          ) : null}
        </>
      ) : (
        <>
          {loadingSavings ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`savings-skeleton-${index}`}
                  className="h-32 animate-pulse rounded-2xl border border-[#EEEDFE] bg-[#F8F7FE]"
                />
              ))}
            </div>
          ) : savingsError ? (
            <div className="rounded-2xl border border-[#F7D6D6] bg-[#FFF7F7] px-4 py-3 text-sm text-[#E24B4A]">
              {savingsError}
            </div>
          ) : savingsGoals.length === 0 ? (
            <div className="rounded-2xl border border-[#EEEDFE] bg-white px-4 py-10 text-center text-sm text-[#8A8799]">
              还没有储蓄目标，点击右下角创建
            </div>
          ) : (
            <section className="space-y-3">
              {savingsGoals.map((goal) => (
                <SavingsCard key={goal.id} goal={goal} onLongPress={openEditSavingSheet} />
              ))}
            </section>
          )}
        </>
      )}

      <div className="pointer-events-none fixed bottom-24 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 px-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={tab === 'budget' ? openCreateBudgetSheet : openCreateSavingSheet}
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#534AB7] text-3xl leading-none text-white"
          >
            ＋
          </button>
        </div>
      </div>

      {budgetSheetOpen && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => setBudgetSheetOpen(false)}
            aria-label="关闭预算弹窗"
          />
          <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-4 pb-6 pt-4">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D8D5E7]" />
            <h3 className="mt-4 text-lg font-semibold text-[#2D2940]">
              {editingBudget?.id ? '编辑预算' : '设置预算'}
            </h3>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs text-[#8A8799]">分类</span>
              <select
                value={budgetCategory}
                onChange={(event) => setBudgetCategory(event.target.value as Category)}
                className="h-11 w-full rounded-[10px] border border-[#E7E5F2] px-3 text-sm outline-none focus:border-[#534AB7]"
              >
                {categoryMeta.map((item) => (
                  <option key={item.category} value={item.category}>
                    {item.emoji} {item.category}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-[#8A8799]">预算金额</span>
              <input
                type="text"
                inputMode="decimal"
                value={budgetLimitInput}
                onChange={(event) =>
                  setBudgetLimitInput(event.target.value.replace(/[^0-9.]/g, ''))
                }
                placeholder="请输入预算金额"
                className="h-11 w-full rounded-[10px] border border-[#E7E5F2] px-3 text-sm outline-none focus:border-[#534AB7]"
              />
            </label>

            {sheetError && (
              <p className="mt-3 rounded-[10px] border border-[#F7D6D6] bg-[#FFF7F7] px-3 py-2 text-xs text-[#E24B4A]">
                {sheetError}
              </p>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitBudget}
              className="mt-4 h-11 w-full rounded-[10px] bg-[#534AB7] text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? '保存中...' : '保存预算'}
            </button>
          </section>
        </div>
      )}

      {savingSheetOpen && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => setSavingSheetOpen(false)}
            aria-label="关闭储蓄弹窗"
          />
          <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-4 pb-6 pt-4">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D8D5E7]" />
            <h3 className="mt-4 text-lg font-semibold text-[#2D2940]">
              {editingSaving ? '更新储蓄目标' : '新建储蓄目标'}
            </h3>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs text-[#8A8799]">目标名称</span>
              <input
                type="text"
                value={savingName}
                onChange={(event) => setSavingName(event.target.value)}
                maxLength={100}
                placeholder="例如：买 MacBook"
                className="h-11 w-full rounded-[10px] border border-[#E7E5F2] px-3 text-sm outline-none focus:border-[#534AB7]"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-[#8A8799]">目标金额</span>
              <input
                type="text"
                inputMode="decimal"
                value={savingTargetInput}
                onChange={(event) => setSavingTargetInput(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="请输入目标金额"
                className="h-11 w-full rounded-[10px] border border-[#E7E5F2] px-3 text-sm outline-none focus:border-[#534AB7]"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-[#8A8799]">当前已存</span>
              <input
                type="text"
                inputMode="decimal"
                value={savingCurrentInput}
                onChange={(event) => setSavingCurrentInput(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="默认 0"
                className="h-11 w-full rounded-[10px] border border-[#E7E5F2] px-3 text-sm outline-none focus:border-[#534AB7]"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-[#8A8799]">预计完成日期</span>
              <input
                type="date"
                value={savingDeadline}
                onChange={(event) => setSavingDeadline(event.target.value)}
                className="h-11 w-full rounded-[10px] border border-[#E7E5F2] px-3 text-sm outline-none focus:border-[#534AB7]"
              />
            </label>

            {sheetError && (
              <p className="mt-3 rounded-[10px] border border-[#F7D6D6] bg-[#FFF7F7] px-3 py-2 text-xs text-[#E24B4A]">
                {sheetError}
              </p>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitSaving}
              className="mt-4 h-11 w-full rounded-[10px] bg-[#534AB7] text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? '保存中...' : '保存目标'}
            </button>

            {editingSaving && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleDeleteSaving}
                className="mt-3 h-11 w-full rounded-[10px] border border-[#F7D6D6] bg-[#FFF7F7] text-sm font-semibold text-[#E24B4A] disabled:opacity-60"
              >
                {savingDeleting ? '删除中...' : '删除目标'}
              </button>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export default PlanPage;
