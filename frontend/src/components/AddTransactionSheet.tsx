import { useEffect, useMemo, useState } from 'react';

import type { Category, Transaction, TransactionCreatePayload, TransactionType } from '@/types';

const categories: Array<{ key: Category; emoji: string }> = [
  { key: '餐饮', emoji: '🍜' },
  { key: '交通', emoji: '🚇' },
  { key: '日用', emoji: '🛒' },
  { key: '娱乐', emoji: '🎮' },
  { key: '医疗', emoji: '💊' },
  { key: '教育', emoji: '📚' },
  { key: '购物', emoji: '🛍️' },
  { key: '收入', emoji: '💰' },
  { key: '其他', emoji: '📌' },
];

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
  const [type, setType] = useState<TransactionType>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState<Category>('餐饮');
  const [dateInput, setDateInput] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

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
    setCategory('餐饮');
    setDateInput(new Date().toISOString().slice(0, 10));
    setNote('');
    setErrorMessage('');
  }, [open, editingItem]);

  const title = editingItem ? '编辑账单' : '新增账单';
  const buttonText = editingItem ? '保存修改' : '确认新增';

  const activeCategories = useMemo(() => {
    if (type === 'income') {
      return categories.filter((item) => item.key === '收入' || item.key === '其他');
    }
    return categories.filter((item) => item.key !== '收入');
  }, [type]);

  useEffect(() => {
    if (!activeCategories.some((item) => item.key === category)) {
      setCategory(activeCategories[0]?.key ?? '其他');
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

      <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5CFC5]" />

        <div className="mt-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#2D2824]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-[10px] border border-[#E5DFD5] px-3 text-xs text-[#6B6560]"
          >
            关闭
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 rounded-[10px] bg-[#E8F0EC] p-1">
          <button
            type="button"
            onClick={() => setType('expense')}
            className={`h-10 rounded-[10px] text-sm font-medium ${
              type === 'expense'
                ? 'bg-white text-[#C27B6B]'
                : 'bg-transparent text-[#6B6560]'
            }`}
          >
            支出
          </button>
          <button
            type="button"
            onClick={() => setType('income')}
            className={`h-10 rounded-[10px] text-sm font-medium ${
              type === 'income'
                ? 'bg-white text-[#6B9E85]'
                : 'bg-transparent text-[#6B6560]'
            }`}
          >
            收入
          </button>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-[#6B6560]">金额</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amountInput}
            onChange={(event) => setAmountInput(sanitizeAmount(event.target.value))}
            className="h-12 w-full rounded-[10px] border border-[#E5DFD5] px-3 text-2xl font-semibold text-[#2D2824] outline-none focus:border-[#5A7A6E]"
          />
        </label>

        <div className="mt-4">
          <p className="mb-2 text-xs text-[#6B6560]">分类</p>
          <div className="grid grid-cols-3 gap-2">
            {activeCategories.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setCategory(item.key)}
                className={`flex h-12 items-center justify-center gap-1 rounded-[10px] border text-sm ${
                  category === item.key
                    ? 'border-[#5A7A6E] bg-[#E8F0EC] text-[#5A7A6E]'
                    : 'border-[#E5DFD5] bg-white text-[#6B6560]'
                }`}
              >
                <span>{item.emoji}</span>
                <span>{item.key}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-[#6B6560]">日期</span>
            <input
              type="date"
              value={dateInput}
              onChange={(event) => setDateInput(event.target.value)}
              className="h-11 w-full rounded-[10px] border border-[#E5DFD5] px-3 text-sm text-[#2D2824] outline-none focus:border-[#5A7A6E]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[#6B6560]">备注（可选）</span>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={255}
              placeholder="写点备注"
              className="h-11 w-full rounded-[10px] border border-[#E5DFD5] px-3 text-sm text-[#2D2824] outline-none focus:border-[#5A7A6E]"
            />
          </label>
        </div>

        {errorMessage && (
          <p className="mt-3 rounded-[10px] border border-[#F2D8D1] bg-[#FDF0EB] px-3 py-2 text-xs text-[#C27B6B]">
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          disabled={submitting}
          onClick={handleConfirm}
          className="mt-4 h-11 w-full rounded-[10px] bg-[#5A7A6E] text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? '提交中...' : buttonText}
        </button>
      </section>
    </div>
  );
}

export default AddTransactionSheet;
