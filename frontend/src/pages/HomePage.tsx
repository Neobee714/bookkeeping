import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';

import client from '@/api/client';
import {
  createTransaction,
  fetchTransactions,
  removeTransaction,
  updateTransaction,
} from '@/api/transactions';
import { fetchMonthlySummary, fetchPartnerMonthlySummary } from '@/api/stats';
import AddTransactionSheet from '@/components/AddTransactionSheet';
import TransactionItem from '@/components/TransactionItem';
import { useAuthStore } from '@/store/authStore';
import { useBillingCycleStore } from '@/store/billingCycleStore';
import { useCategoryStore } from '@/store/categoryStore';
import { useTransactionSyncStore } from '@/store/transactionSyncStore';
import type {
  ApiResponse,
  MonthlySummary,
  Transaction,
  TransactionCreatePayload,
} from '@/types';
import { formatBillingCycleTip, getBillingCycleRange } from '@/utils/billingCycle';
import { useCachedResource } from '@/utils/useCachedResource';
type ViewMode = 'mine' | 'partner';

const getMonthKey = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const shiftMonth = (value: Date, delta: number): Date => {
  const targetMonth = new Date(value.getFullYear(), value.getMonth() + delta, 1);
  const lastDay = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0,
  ).getDate();
  return new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth(),
    Math.min(value.getDate(), lastDay),
  );
};

const formatMonthLabel = (value: Date): string =>
  value.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });

const formatGroupDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
};

const fetchPartnerTransactions = async (period: {
  month: string;
  startDate?: string;
  endDate?: string;
}): Promise<Transaction[]> => {
  const response = await client.get<ApiResponse<Transaction[]>>('/transactions/partner', {
    params: {
      month: period.month,
      ...(period.startDate ? { start_date: period.startDate } : {}),
      ...(period.endDate ? { end_date: period.endDate } : {}),
    },
  });

  if (!response.data.success) {
    throw new Error(response.data.message || '伴侣账单加载失败');
  }

  return response.data.data;
};

const formatMoney = (value: number): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const getHomeErrorMessage = (error: unknown, viewMode: ViewMode): string => {
  if (axios.isAxiosError(error)) {
    if (viewMode === 'partner' && error.response?.status === 403) {
      return '还没有绑定伴侣';
    }

    const serverMessage = error.response?.data?.message;
    if (typeof serverMessage === 'string' && serverMessage.trim()) {
      return serverMessage;
    }

    if (error.code === 'ECONNABORTED') {
      return '账单请求超时，后端可能暂时不可用，请稍后重试';
    }

    if (!error.response) {
      return '账单接口没有响应，请检查网络或稍后重试';
    }

    return `账单接口返回异常状态（${error.response.status}）`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '账单加载失败';
};

function SkeletonList() {
  return (
    <div className="ios-glass space-y-3 p-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={`skeleton-${index}`}
          className="flex items-center gap-3 border-b border-[rgba(60,60,67,0.08)] py-2 last:border-b-0"
        >
          <div className="h-10 w-10 animate-pulse rounded-xl bg-black/5" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-black/5" />
            <div className="h-3 w-32 animate-pulse rounded bg-black/5" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-black/5" />
        </div>
      ))}
    </div>
  );
}

function HomePage() {
  const user = useAuthStore((state) => state.user);
  const monthlyStartDay = useBillingCycleStore((state) => state.monthlyStartDay);
  const refreshVersion = useTransactionSyncStore((state) => state.refreshVersion);
  const { loaded: categoriesLoaded, fetchCategories } = useCategoryStore();

  useEffect(() => {
    if (!categoriesLoaded) {
      void fetchCategories();
    }
  }, [categoriesLoaded, fetchCategories]);

  const [viewMode, setViewMode] = useState<ViewMode>('mine');
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showCycleTip, setShowCycleTip] = useState(true);

  const monthKey = useMemo(() => getMonthKey(currentMonth), [currentMonth]);
  const monthLabel = useMemo(() => formatMonthLabel(currentMonth), [currentMonth]);
  const billingCycleRange = useMemo(
    () => getBillingCycleRange(currentMonth, monthlyStartDay),
    [currentMonth, monthlyStartDay],
  );
  const queryPeriod = useMemo(
    () => ({
      month: monthKey,
      startDate: billingCycleRange.startDate,
      endDate: billingCycleRange.endDate,
    }),
    [billingCycleRange.endDate, billingCycleRange.startDate, monthKey],
  );
  const partnerName = user?.partner?.nickname?.trim() || '伴侣';
  const showPartnerTab = Boolean(user?.partner?.nickname);
  const isMineView = viewMode === 'mine';

  const txResource = useCachedResource<Transaction[]>(
    `tx:${viewMode}:${monthKey}:${billingCycleRange.rangeKey}`,
    () => (isMineView ? fetchTransactions(queryPeriod) : fetchPartnerTransactions(queryPeriod)),
    [viewMode, monthKey, billingCycleRange.rangeKey, refreshVersion],
  );
  const summaryResource = useCachedResource<MonthlySummary>(
    `sum:${viewMode}:${monthKey}:${billingCycleRange.rangeKey}`,
    () =>
      isMineView
        ? fetchMonthlySummary(queryPeriod)
        : fetchPartnerMonthlySummary(queryPeriod),
    [viewMode, monthKey, billingCycleRange.rangeKey, refreshVersion],
  );

  const transactions = txResource.data ?? [];
  const summary = summaryResource.data ?? null;
  const loading = txResource.loading || summaryResource.loading;
  const error = txResource.error ?? summaryResource.error;
  const errorMessage = error ? getHomeErrorMessage(error, viewMode) : '';

  useEffect(() => {
    if (!showPartnerTab && viewMode === 'partner') {
      setViewMode('mine');
    }
  }, [showPartnerTab, viewMode]);

  useEffect(() => {
    if (viewMode === 'partner') {
      setSheetOpen(false);
      setEditingItem(null);
      setDeletingId(null);
    }
  }, [viewMode]);

  useEffect(() => {
    setShowCycleTip(true);
    const timeoutId = window.setTimeout(() => {
      setShowCycleTip(false);
    }, 2600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [monthlyStartDay]);

  const reloadAfterMutation = async () => {
    useTransactionSyncStore.getState().bumpRefreshVersion();
  };

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    transactions.forEach((item) => {
      const key = item.date;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)?.push(item);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => (a > b ? -1 : 1));
  }, [transactions]);

  const handleOpenCreate = () => {
    if (!isMineView) {
      return;
    }
    setEditingItem(null);
    setSheetOpen(true);
  };

  const handleOpenEdit = (transaction: Transaction) => {
    if (!isMineView) {
      return;
    }
    setEditingItem(transaction);
    setSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setSheetOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = async (payload: TransactionCreatePayload) => {
    setSubmitting(true);
    try {
      if (editingItem) {
        await updateTransaction(editingItem.id, {
          amount: payload.amount,
          type: payload.type,
          category: payload.category,
          date: payload.date,
          note: payload.note ?? null,
        });
      } else {
        await createTransaction(payload);
      }
      handleCloseSheet();
      await reloadAfterMutation();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        window.alert(error.response?.data?.message ?? '提交失败');
      } else if (error instanceof Error) {
        window.alert(error.message);
      } else {
        window.alert('提交失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (transaction: Transaction) => {
    if (!isMineView) {
      return;
    }

    const confirmed = window.confirm(`确定删除这条账单吗？\n${transaction.category} ${transaction.amount}`);
    if (!confirmed) {
      return;
    }

    setDeletingId(transaction.id);
    try {
      await removeTransaction(transaction.id);
      await reloadAfterMutation();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        window.alert(error.response?.data?.message ?? '删除失败');
      } else if (error instanceof Error) {
        window.alert(error.message);
      } else {
        window.alert('删除失败');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const totalIncome = summary?.total_income ?? 0;
  const totalExpense = summary?.total_expense ?? 0;
  const balance = summary?.balance ?? 0;

  return (
    <section className="space-y-3">
      <h1 className="ios-anim mb-1 mt-2 text-[34px] font-bold tracking-tight text-[#1C1C1E]">
        金流
      </h1>

      {showCycleTip && (
        <div className="pointer-events-none fixed left-1/2 top-[82px] z-20 w-[calc(100%-32px)] max-w-[398px] -translate-x-1/2">
          <div className="ios-glass ios-anim px-4 py-2 text-center text-xs text-[#1C1C1E]">
            {formatBillingCycleTip(monthlyStartDay)}
          </div>
        </div>
      )}

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

        <div className="flex justify-between gap-2">
          <div className="flex-1 text-center">
            <p className="mb-1 text-xs font-medium text-[#8E8E93]">收入</p>
            <p className="whitespace-nowrap text-[17px] font-bold tracking-tight text-[#34C759]">
              ¥{formatMoney(totalIncome)}
            </p>
          </div>
          <div className="flex-1 text-center">
            <p className="mb-1 text-xs font-medium text-[#8E8E93]">支出</p>
            <p className="whitespace-nowrap text-[17px] font-bold tracking-tight text-[#FF3B30]">
              ¥{formatMoney(totalExpense)}
            </p>
          </div>
          <div className="flex-1 text-center">
            <p className="mb-1 text-xs font-medium text-[#8E8E93]">结余</p>
            <p className="whitespace-nowrap text-[17px] font-bold tracking-tight text-[#1C1C1E]">
              ¥{formatMoney(balance)}
            </p>
          </div>
        </div>
      </div>

      {showPartnerTab && (
        <div className="ios-segment ios-anim ios-anim-d2 flex">
          <button
            type="button"
            onClick={() => setViewMode('mine')}
            className={`ios-segment-btn ${isMineView ? 'active' : ''}`}
          >
            我的
          </button>
          <button
            type="button"
            onClick={() => setViewMode('partner')}
            className={`ios-segment-btn ${!isMineView ? 'active' : ''}`}
          >
            {partnerName}
          </button>
        </div>
      )}

      {loading && transactions.length === 0 && !summary ? (
        <SkeletonList />
      ) : errorMessage ? (
        <div className="ios-glass ios-anim ios-anim-d3 px-4 py-3 text-sm text-[#FF3B30]">
          {errorMessage}
        </div>
      ) : groupedTransactions.length === 0 ? (
        <div className="ios-glass ios-anim ios-anim-d3 px-4 py-10 text-center text-sm text-[#8E8E93]">
          {isMineView
            ? '这个月还没有账单，点右下角添加第一笔吧'
            : `${partnerName} 这个月还没有账单`}
        </div>
      ) : (
        <div className={isMineView ? '' : 'pointer-events-none'}>
          {groupedTransactions.map(([date, items], groupIndex) => {
            const dayExpense = items.reduce(
              (sum, item) => (item.type === 'expense' ? sum + item.amount : sum),
              0,
            );
            return (
            <div
              key={date}
              className={`ios-glass ios-anim p-4 ${
                groupIndex === 0
                  ? 'ios-anim-d3'
                  : groupIndex === 1
                    ? 'ios-anim-d4'
                    : 'ios-anim-d5'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-semibold tracking-wide text-[#8E8E93]">
                  {formatGroupDate(date)}
                </p>
                {dayExpense > 0 && (
                  <p className="text-[13px] font-semibold tracking-wide text-[#8E8E93]">
                    支出 ¥{formatMoney(dayExpense)}
                  </p>
                )}
              </div>
              {items.map((item) => (
                <TransactionItem
                  key={item.id}
                  item={item}
                  deleting={deletingId === item.id}
                  onEdit={handleOpenEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
            );
          })}
        </div>
      )}

      {isMineView && (
        <div className="pointer-events-none fixed bottom-[108px] left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 px-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleOpenCreate}
              className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#007AFF] text-[30px] font-light leading-none text-white transition-transform active:scale-90"
              style={{
                boxShadow:
                  '0 4px 16px rgba(0,122,255,0.4), 0 1px 3px rgba(0,0,0,0.1)',
              }}
              aria-label="添加账单"
            >
              +
            </button>
          </div>
        </div>
      )}

      <AddTransactionSheet
        open={sheetOpen}
        submitting={submitting}
        editingItem={editingItem}
        onClose={handleCloseSheet}
        onSubmit={handleSubmit}
      />
    </section>
  );
}

export default HomePage;
