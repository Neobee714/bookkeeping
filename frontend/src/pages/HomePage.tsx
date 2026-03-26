import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';

import {
  createTransaction,
  fetchTransactions,
  removeTransaction,
  updateTransaction,
} from '@/api/transactions';
import AddTransactionSheet from '@/components/AddTransactionSheet';
import TransactionItem from '@/components/TransactionItem';
import { useAuthStore } from '@/store/authStore';
import { useTransactionSyncStore } from '@/store/transactionSyncStore';
import type { Transaction, TransactionCreatePayload } from '@/types';

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

  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Transaction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const monthKey = useMemo(() => getMonthKey(currentMonth), [currentMonth]);
  const monthLabel = useMemo(() => formatMonthLabel(currentMonth), [currentMonth]);

  const loadTransactions = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchTransactions(monthKey);
      setTransactions(data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(error.response?.data?.message ?? '账单加载失败');
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
    void loadTransactions();
  }, [monthKey, refreshVersion]);

  const summary = useMemo(() => {
    const income = transactions
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + item.amount, 0);
    const expense = transactions
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      totalIncome: income,
      totalExpense: expense,
      balance: income - expense,
    };
  }, [transactions]);

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
    setEditingItem(null);
    setSheetOpen(true);
  };

  const handleOpenEdit = (transaction: Transaction) => {
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
      await loadTransactions();
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
    const confirmed = window.confirm(`确定删除这条账单吗？\n${transaction.category} ${transaction.amount}`);
    if (!confirmed) {
      return;
    }
    setDeletingId(transaction.id);
    try {
      await removeTransaction(transaction.id);
      await loadTransactions();
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

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EEEDFE] text-sm font-semibold text-[#534AB7]">
            {(user?.nickname?.[0] ?? '我').toUpperCase()}
          </div>
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
      </header>

      <article className="rounded-2xl bg-[#534AB7] px-4 py-5 text-white">
        <p className="text-sm text-[#D9D6FF]">本月支出</p>
        <p className="mt-2 text-3xl font-semibold">
          {summary.totalExpense.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-[#D9D6FF]">本月收入</p>
            <p className="mt-1 text-base font-semibold">
              {summary.totalIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#D9D6FF]">本月结余</p>
            <p className="mt-1 text-base font-semibold">
              {summary.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </article>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#2D2940]">账单记录</h2>
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
            这个月还没有账单，点右下角添加第一笔吧
          </div>
        ) : (
          <div className="space-y-4">
            {groupedTransactions.map(([date, items]) => (
              <div key={date} className="space-y-2">
                <p className="px-1 text-xs font-medium text-[#8A8799]">{formatGroupDate(date)}</p>
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
            ))}
          </div>
        )}
      </section>

      <div className="pointer-events-none fixed bottom-24 left-1/2 z-20 w-full max-w-[430px] -translate-x-1/2 px-4">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleOpenCreate}
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#534AB7] text-3xl leading-none text-white"
          >
            ＋
          </button>
        </div>
      </div>

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
