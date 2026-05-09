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

const categoryMeta: Array<{ category: Category; emoji: string; gradient: [string, string] }> = [
  { category: '餐饮', emoji: '🍜', gradient: ['#FF9500', '#FFB340'] },
  { category: '交通', emoji: '🚇', gradient: ['#007AFF', '#5AC8FA'] },
  { category: '日用', emoji: '🛒', gradient: ['#34C759', '#30D158'] },
  { category: '娱乐', emoji: '🎮', gradient: ['#FF2D55', '#FF6961'] },
  { category: '医疗', emoji: '💊', gradient: ['#34C759', '#5AC8FA'] },
  { category: '教育', emoji: '📚', gradient: ['#5AC8FA', '#64D2FF'] },
  { category: '购物', emoji: '🛍️', gradient: ['#AF52DE', '#FF2D55'] },
  { category: '收入', emoji: '💰', gradient: ['#34C759', '#30D158'] },
  { category: '其他', emoji: '📌', gradient: ['#8E8E93', '#AEAEB2'] },
];

const getMeta = (category: Category) =>
  categoryMeta.find((item) => item.category === category) ?? categoryMeta[categoryMeta.length - 1];

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

const getProgressInfo = (spent: number, limit: number, gradient: [string, string]) => {
  if (limit <= 0) {
    if (spent > 0) {
      return {
        percent: 100,
        rate: Number.POSITIVE_INFINITY,
        background: 'linear-gradient(90deg,#FF3B30,#FF6961)',
      };
    }
    return {
      percent: 0,
      rate: 0,
      background: `linear-gradient(90deg,${gradient[0]},${gradient[1]})`,
    };
  }
  const rate = spent / limit;
  const percent = Math.min(rate * 100, 100);
  let background = `linear-gradient(90deg,${gradient[0]},${gradient[1]})`;
  if (rate > 1) {
    background = 'linear-gradient(90deg,#FF3B30,#FF6961)';
  } else if (rate >= 0.9) {
    background = 'linear-gradient(90deg,#FF9500,#FF3B30)';
  }
  return { percent, rate, background };
};

interface SavingsCardProps {
  goal: SavingsGoal;
  onLongPress: (goal: SavingsGoal) => void;
}

function SavingsCard({ goal, onLongPress }: SavingsCardProps) {
  const timerRef = useRef<number | null>(null);

  const progress = goal.target_amount > 0 ? Math.min(goal.current_amount / goal.target_amount, 1) : 0;
  const radius = 22;
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

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseDown={startPress}
      onMouseUp={stopPress}
      onMouseLeave={stopPress}
      onTouchStart={startPress}
      onTouchEnd={stopPress}
      onTouchCancel={stopPress}
      className="flex items-center gap-3.5 border-b border-[rgba(60,60,67,0.08)] py-3 last:border-b-0"
    >
      <svg width="52" height="52" viewBox="0 0 52 52" className="flex-shrink-0">
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke="rgba(118,118,128,0.1)"
          strokeWidth="4.5"
        />
        <circle
          cx="26"
          cy="26"
          r={radius}
          fill="none"
          stroke="#007AFF"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 26 26)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-[#1C1C1E]">{goal.name}</p>
        <p className="mt-0.5 text-[13px] text-[#8E8E93]">
          {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)} · {percent}%
        </p>
      </div>
    </div>
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

  return (
    <section className="space-y-3 pb-2">
      <h1 className="ios-anim mb-1 mt-2 text-[34px] font-bold tracking-tight text-[#1C1C1E]">
        规划
      </h1>

      <div className="ios-segment ios-anim ios-anim-d1 flex">
        <button
          type="button"
          onClick={() => setTab('budget')}
          className={`ios-segment-btn ${tab === 'budget' ? 'active' : ''}`}
        >
          预算
        </button>
        <button
          type="button"
          onClick={() => setTab('savings')}
          className={`ios-segment-btn ${tab === 'savings' ? 'active' : ''}`}
        >
          存钱
        </button>
      </div>

      {tab === 'budget' && (
        <div className="ios-anim ios-anim-d2 flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={() => setMonth((previous) => shiftMonth(previous, -1))}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgba(0,122,255,0.1)] text-[15px] font-semibold text-[#007AFF]"
            aria-label="上个月"
          >
            ‹
          </button>
          <span className="text-[17px] font-semibold text-[#1C1C1E]">{monthLabel}</span>
          <button
            type="button"
            onClick={() => setMonth((previous) => shiftMonth(previous, 1))}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[rgba(0,122,255,0.1)] text-[15px] font-semibold text-[#007AFF]"
            aria-label="下个月"
          >
            ›
          </button>
        </div>
      )}

      {tab === 'budget' ? (
        <>
          {loadingBudget ? (
            <div className="ios-glass h-48 animate-pulse" />
          ) : budgetError ? (
            <div className="ios-glass px-4 py-3 text-sm text-[#FF3B30]">{budgetError}</div>
          ) : budgetSummary ? (
            <div className="ios-glass ios-glass-strong ios-anim ios-anim-d3 p-4">
              <p className="mb-3 text-[13px] font-medium text-[#8E8E93]">
                本月预算 · {monthLabel}
              </p>

              {budgetSummary.items.map((item) => {
                const meta = getMeta(item.category);
                const progress = getProgressInfo(item.actual_spent, item.monthly_limit, meta.gradient);
                return (
                  <button
                    type="button"
                    key={`${item.category}-${item.id ?? 'new'}`}
                    onClick={() => openEditBudgetSheet(item)}
                    className="block w-full text-left last:mb-0 mb-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[15px] font-medium text-[#1C1C1E]">
                        {meta.emoji} {item.category}
                      </span>
                      <span className="text-[13px] text-[#8E8E93]">
                        {formatCurrency(item.actual_spent)} / {formatCurrency(item.monthly_limit)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[rgba(118,118,128,0.1)]">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{
                          width: `${progress.percent}%`,
                          background: progress.background,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {loadingSavings ? (
            <div className="ios-glass h-48 animate-pulse" />
          ) : savingsError ? (
            <div className="ios-glass px-4 py-3 text-sm text-[#FF3B30]">{savingsError}</div>
          ) : savingsGoals.length === 0 ? (
            <div className="ios-glass px-4 py-10 text-center text-sm text-[#8E8E93]">
              还没有储蓄目标，点击右下角创建
            </div>
          ) : (
            <div className="ios-glass ios-anim ios-anim-d3 p-4">
              <p className="mb-3 text-[13px] font-medium text-[#8E8E93]">存钱目标</p>
              {savingsGoals.map((goal) => (
                <SavingsCard key={goal.id} goal={goal} onLongPress={openEditSavingSheet} />
              ))}
              <p className="mt-3 text-center text-xs text-[#8E8E93]">长按目标可编辑或更新进度</p>
            </div>
          )}
        </>
      )}

      <div className="pointer-events-none fixed bottom-[108px] left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 px-5">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={tab === 'budget' ? openCreateBudgetSheet : openCreateSavingSheet}
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#007AFF] text-[30px] font-light leading-none text-white transition-transform active:scale-90"
            style={{
              boxShadow: '0 4px 16px rgba(0,122,255,0.4), 0 1px 3px rgba(0,0,0,0.1)',
            }}
            aria-label="添加"
          >
            +
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
          <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-5 pb-8 pt-4">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5D5DB]" />
            <h3 className="mt-4 text-lg font-semibold text-[#1C1C1E]">
              {editingBudget?.id ? '编辑预算' : '设置预算'}
            </h3>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs text-[#8E8E93]">分类</span>
              <select
                value={budgetCategory}
                onChange={(event) => setBudgetCategory(event.target.value as Category)}
                className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] bg-white px-3 text-sm outline-none focus:border-[#007AFF]"
              >
                {categoryMeta.map((item) => (
                  <option key={item.category} value={item.category}>
                    {item.emoji} {item.category}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-[#8E8E93]">预算金额</span>
              <input
                type="text"
                inputMode="decimal"
                value={budgetLimitInput}
                onChange={(event) =>
                  setBudgetLimitInput(event.target.value.replace(/[^0-9.]/g, ''))
                }
                placeholder="请输入预算金额"
                className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] px-3 text-sm outline-none focus:border-[#007AFF]"
              />
            </label>

            {sheetError && (
              <p className="mt-3 rounded-[10px] bg-[rgba(255,59,48,0.1)] px-3 py-2 text-xs text-[#FF3B30]">
                {sheetError}
              </p>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitBudget}
              className="mt-4 h-12 w-full rounded-[12px] bg-[#007AFF] text-[15px] font-semibold text-white disabled:opacity-60"
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
          <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-5 pb-8 pt-4">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5D5DB]" />
            <h3 className="mt-4 text-lg font-semibold text-[#1C1C1E]">
              {editingSaving ? '更新储蓄目标' : '新建储蓄目标'}
            </h3>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs text-[#8E8E93]">目标名称</span>
              <input
                type="text"
                value={savingName}
                onChange={(event) => setSavingName(event.target.value)}
                maxLength={100}
                placeholder="例如：买 MacBook"
                className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] px-3 text-sm outline-none focus:border-[#007AFF]"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-[#8E8E93]">目标金额</span>
              <input
                type="text"
                inputMode="decimal"
                value={savingTargetInput}
                onChange={(event) => setSavingTargetInput(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="请输入目标金额"
                className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] px-3 text-sm outline-none focus:border-[#007AFF]"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-[#8E8E93]">当前已存</span>
              <input
                type="text"
                inputMode="decimal"
                value={savingCurrentInput}
                onChange={(event) => setSavingCurrentInput(event.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="默认 0"
                className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] px-3 text-sm outline-none focus:border-[#007AFF]"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs text-[#8E8E93]">预计完成日期</span>
              <input
                type="date"
                value={savingDeadline}
                onChange={(event) => setSavingDeadline(event.target.value)}
                className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] px-3 text-sm outline-none focus:border-[#007AFF]"
              />
            </label>

            {sheetError && (
              <p className="mt-3 rounded-[10px] bg-[rgba(255,59,48,0.1)] px-3 py-2 text-xs text-[#FF3B30]">
                {sheetError}
              </p>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitSaving}
              className="mt-4 h-12 w-full rounded-[12px] bg-[#007AFF] text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {submitting ? '保存中...' : '保存目标'}
            </button>

            {editingSaving && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleDeleteSaving}
                className="mt-3 h-12 w-full rounded-[12px] bg-[rgba(255,59,48,0.1)] text-[15px] font-semibold text-[#FF3B30] disabled:opacity-60"
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
