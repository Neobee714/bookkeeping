import { useEffect, useMemo, useState } from 'react';

import { useCategoryStore } from '@/store/categoryStore';
import type { Category, Transaction, TransactionCreatePayload, TransactionType } from '@/types';

interface AddTransactionSheetProps {
  open: boolean;
  submitting: boolean;
  editingItem: Transaction | null;
  onClose: () => void;
  onSubmit: (payload: TransactionCreatePayload) => Promise<void>;
}

const toDateInputValue = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
};

const sanitizeAmount = (raw: string): string => {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) {
    return '';
  }

  const [whole, ...rest] = cleaned.split('.');
  const decimal = rest.join('').slice(0, 2);
  if (rest.length === 0) {
    return whole;
  }
  return `${whole}.${decimal}`;
};

function AddTransactionSheet({
  open,
  submitting,
  editingItem,
  onClose,
  onSubmit,
}: AddTransactionSheetProps) {
  const { loaded, fetchCategories, categories } = useCategoryStore();

  const [type, setType] = useState<TransactionType>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState<Category>('');
  const [dateInput, setDateInput] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (open && !loaded) {
      void fetchCategories();
    }
  }, [open, loaded, fetchCategories]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (editingItem) {
      setType(editingItem.type);
      setAmountInput(String(editingItem.amount));
      setCategory(editingItem.category);
      setDateInput(toDateInputValue(editingItem.date));
      setNote(editingItem.note ?? '');
      setErrorMessage('');
      return;
    }

    setType('expense');
    setAmountInput('');
    setCategory('');
    setDateInput(new Date().toISOString().slice(0, 10));
    setNote('');
    setErrorMessage('');
  }, [open, editingItem]);

  const title = editingItem ? '编辑账单' : '新增账单';
  const buttonText = editingItem ? '保存修改' : '确认新增';

  const activeCategories = useMemo(() => {
    if (type === 'income') {
      return categories.filter((c) => c.type === 'income');
    }
    return categories.filter((c) => c.type === 'expense');
  }, [type, categories]);

  useEffect(() => {
    if (activeCategories.length > 0 && !activeCategories.some((c) => c.name === category)) {
      setCategory(activeCategories[0].name);
    }
  }, [activeCategories, category]);

  if (!open) {
    return null;
  }

  const handleConfirm = async () => {
    const amount = Number.parseFloat(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('请输入有效金额');
      return;
    }

    if (!dateInput) {
      setErrorMessage('请选择日期');
      return;
    }

    setErrorMessage('');
    await onSubmit({
      amount: Number(amount.toFixed(2)),
      type,
      category,
      date: dateInput,
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭弹窗"
        onClick={onClose}
      />

      <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-5 pb-8 pt-4">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5D5DB]" />

        <div className="mt-4 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold text-[#1C1C1E]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-[10px] bg-[rgba(118,118,128,0.12)] px-3 text-xs text-[#1C1C1E]"
          >
            关闭
          </button>
        </div>

        <div className="ios-segment mt-4 flex">
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`ios-segment-btn ${type === 'expense' ? 'active' : ''}`}
            style={{
              color: type === 'expense' ? '#FF3B30' : '#1C1C1E',
            }}
          >
            支出
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            className={`ios-segment-btn ${type === 'income' ? 'active' : ''}`}
            style={{
              color: type === 'income' ? '#34C759' : '#1C1C1E',
            }}
          >
            收入
          </button>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-[#8E8E93]">金额</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amountInput}
            onChange={(event) => setAmountInput(sanitizeAmount(event.target.value))}
            className="h-12 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] px-3 text-2xl font-semibold text-[#1C1C1E] outline-none focus:border-[#007AFF]"
          />
        </label>

        <div className="mt-4">
          <p className="mb-2 text-xs text-[#8E8E93]">分类</p>
          <div className="grid grid-cols-3 gap-2">
            {activeCategories.map((item) => {
              const active = category === item.name;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.name)}
                  className={`flex h-12 items-center justify-center gap-1 rounded-[10px] border text-sm transition ${
                    active
                      ? 'border-[#007AFF] bg-[rgba(0,122,255,0.08)] text-[#007AFF]'
                      : 'border-[rgba(60,60,67,0.12)] bg-white text-[#1C1C1E]'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-[#8E8E93]">日期</span>
            <input
              type="date"
              value={dateInput}
              onChange={(event) => setDateInput(event.target.value)}
              className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] px-3 text-sm text-[#1C1C1E] outline-none focus:border-[#007AFF]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[#8E8E93]">备注（可选）</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={255}
              placeholder="写点备注"
              className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] px-3 text-sm text-[#1C1C1E] outline-none focus:border-[#007AFF]"
            />
          </label>
        </div>

        {errorMessage && (
          <p className="mt-3 rounded-[10px] bg-[rgba(255,59,48,0.1)] px-3 py-2 text-xs text-[#FF3B30]">
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          disabled={submitting}
          onClick={handleConfirm}
          className="mt-4 h-12 w-full rounded-[12px] bg-[#007AFF] text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {submitting ? '提交中...' : buttonText}
        </button>
      </section>
    </div>
  );
}

export default AddTransactionSheet;
