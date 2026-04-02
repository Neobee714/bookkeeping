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
import UserAvatar from '@/components/UserAvatar';
import { useAuthStore } from '@/store/authStore';
import { useTransactionSyncStore } from '@/store/transactionSyncStore';
import type {
  ApiResponse,
  MonthlySummary,
  Transaction,
  TransactionCreatePayload,
} from '@/types';

type ViewMode = 'mine' | 'partner';

const getMonthKey = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const shiftMonth = (value: Date, delta: number): Date =>
  new Date(value.getFullYear(), value.getMonth() + delta, 1);

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

const fetchPartnerTransactions = async (month: string): Promise<Transaction[]> => {
  const response = await client.get<ApiResponse<Transaction[]>>('/transactions/partner', {
    params: { month },
  });

  if (!response.data.success) {
    throw new Error(response.data.message || '伴侣账单加载失败');
  }

  return response.data.data;
};

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={`skeleton-${index}`}
          className="animate-pulse rounded-2xl border border-[#EEEDFE] bg-white px-3 py-3"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#ECEAF8]" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded bg-[#ECEAF8]" />
              <div className="h-3 w-32 rounded bg-[#F3F1FA]" />
            </div>
            <div className="h-3 w-16 rounded bg-[#ECEAF8]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function HomePage() {
  const user = useAuthStore((state) => state.user);
  const refreshVersion = useTransactionSyncStore((state) => state.refreshVersion);

  const [viewMode, setViewMode] = useState<ViewMode>('mine');
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const monthKey = useMemo(() => getMonthKey(currentMonth), [currentMonth]);
  const monthLabel = useMemo(() => formatMonthLabel(currentMonth), [currentMonth]);
  const partnerName = user?.partner?.nickname?.trim() || '伴侣';
  const showPartnerTab = Boolean(user?.partner?.nickname);
  const isMineView = viewMode === 'mine';

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

  const loadDashboard = async () => {
    setLoading(true);
    setErrorMessage('');
    setTransactions([]);
    setSummary(null);

    try {
      const [nextTransactions, nextSummary] = await Promise.all([
        isMineView ? fetchTransactions(monthKey) : fetchPartnerTransactions(monthKey),
        isMineView ? fetchMonthlySummary(monthKey) : fetchPartnerMonthlySummary(monthKey),
      ]);
      setTransactions(nextTransactions);
      setSummary(nextSummary);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (viewMode === 'partner' && error.response?.status === 403) {
          setErrorMessage('还没有绑定伴侣');
        } else {
          setErrorMessage(error.response?.data?.message ?? '账单加载失败');
        }
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('账单加载失败');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [monthKey, viewMode, refreshVersion]);

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
      await loadDashboard();
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
      await loadDashboard();
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
    <section className="space-y-4">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <UserAvatar avatar={user?.avatar} name={user?.nickname} />
            <div>
              <p className="text-sm text-[#8A8799]">你好</p>
              <p className="text-base font-semibold text-[#2D2940]">{user?.nickname ?? '我'}</p>
            </div>
          </div>

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
        </div>

        {showPartnerTab && (
          <div className="grid grid-cols-2 rounded-[10px] bg-[#F4F2FD] p-1">
            <button
              type="button"
              onClick={() => setViewMode('mine')}
              className={`h-9 rounded-[10px] text-sm ${
                viewMode === 'mine' ? 'bg-white text-[#534AB7]' : 'text-[#8A8799]'
              }`}
            >
              我
            </button>
            <button
              type="button"
              onClick={() => setViewMode('partner')}
              className={`h-9 rounded-[10px] text-sm ${
                viewMode === 'partner' ? 'bg-white text-[#534AB7]' : 'text-[#8A8799]'
              }`}
            >
              {partnerName}
            </button>
          </div>
        )}
      </header>

      <article className="rounded-2xl bg-[#534AB7] px-4 py-5 text-white">
        <p className="text-sm text-[#D9D6FF]">本月支出</p>
        <p className="mt-2 text-3xl font-semibold">
          {totalExpense.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-[#D9D6FF]">本月收入</p>
            <p className="mt-1 text-base font-semibold">
              {totalIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#D9D6FF]">本月结余</p>
            <p className="mt-1 text-base font-semibold">
              {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </article>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#2D2940]">
            {isMineView ? '账单记录' : `${partnerName}的账单`}
          </h2>
          <span className="text-xs text-[#8A8799]">{monthKey}</span>
        </div>

        {loading ? (
          <SkeletonList />
        ) : errorMessage ? (
          <div className="rounded-2xl border border-[#F7D6D6] bg-[#FFF7F7] px-4 py-3 text-sm text-[#E24B4A]">
            {errorMessage}
          </div>
        ) : groupedTransactions.length === 0 ? (
          <div className="rounded-2xl border border-[#EEEDFE] bg-white px-4 py-10 text-center text-sm text-[#8A8799]">
            {isMineView
              ? '这个月还没有账单，点右下角添加第一笔吧'
              : `${partnerName} 这个月还没有账单`}
          </div>
        ) : (
          <div className={isMineView ? 'space-y-4' : 'pointer-events-none space-y-4'}>
            {groupedTransactions.map(([date, items]) => {
              const dailyExpense = items
                .filter((t) => t.type === 'expense')
                .reduce((sum, t) => sum + t.amount, 0);
              const dailyIncome = items
                .filter((t) => t.type === 'income')
                .reduce((sum, t) => sum + t.amount, 0);
              return (
              <div key={date} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs font-medium text-[#8A8799]">{formatGroupDate(date)}</p>
                  <div className="flex items-center gap-2">
                    {dailyExpense > 0 && (
                      <span className="text-xs text-[#E24B4A]">
                        出 -{dailyExpense.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    )}
                    {dailyIncome > 0 && (
                      <span className="text-xs text-[#1D9E75]">
                        入 +{dailyIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
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
              </div>
              );
            })}
          </div>
        )}
      </section>

      {isMineView && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 px-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleOpenCreate}
              className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#534AB7] text-3xl leading-none text-white"
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
