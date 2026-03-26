import { useRef, useState, type MouseEvent } from 'react';

import type { Category, Transaction } from '@/types';

const LONG_PRESS_MS = 450;

const categoryEmojiMap: Record<Category, string> = {
  餐饮: '🍜',
  交通: '🚇',
  日用: '🛒',
  娱乐: '🎮',
  医疗: '💊',
  教育: '📚',
  购物: '🛍️',
  收入: '💰',
  其他: '📌',
};

interface TransactionItemProps {
  item: Transaction;
  deleting: boolean;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

function TransactionItem({
  item,
  deleting,
  onEdit,
  onDelete,
}: TransactionItemProps) {
  const [showDeleteAction, setShowDeleteAction] = useState(false);
  const longPressRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPress = () => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const startLongPress = () => {
    clearLongPress();
    longPressTriggeredRef.current = false;
    longPressRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setShowDeleteAction(true);
    }, LONG_PRESS_MS);
  };

  const stopLongPress = () => {
    clearLongPress();
  };

  const handleClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    onEdit(item);
  };

  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onDelete(item);
  };

  const handleResetDelete = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setShowDeleteAction(false);
  };

  const handleTouchStart = () => {
    startLongPress();
  };

  const handleTouchEnd = () => {
    stopLongPress();
  };

  const amountText = `${item.type === 'income' ? '+' : '-'}${item.amount.toLocaleString()}`;
  const amountColor = item.type === 'income' ? '#1D9E75' : '#E24B4A';

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseDown={startLongPress}
      onMouseUp={stopLongPress}
      onMouseLeave={stopLongPress}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={handleClick}
      className="w-full rounded-2xl border border-[#EEEDFE] bg-white px-3 py-3 text-left transition"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3F1FF] text-xl">
          {categoryEmojiMap[item.category]}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="truncate text-sm font-semibold text-[#2D2940]">{item.category}</p>
            <p className="text-sm font-semibold" style={{ color: amountColor }}>
              {amountText}
            </p>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-[#8A8799]">
            <p className="truncate">{item.note || '无备注'}</p>
            <p>{formatDate(item.date)}</p>
          </div>
        </div>
      </div>

      {showDeleteAction && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleResetDelete}
            className="h-8 rounded-[10px] border border-[#E8E6F8] px-3 text-xs text-[#6F6A7E]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={handleDeleteClick}
            className="h-8 rounded-[10px] border border-[#F7D6D6] bg-[#FFF7F7] px-3 text-xs text-[#E24B4A] disabled:opacity-60"
          >
            {deleting ? '删除中...' : '删除'}
          </button>
        </div>
      )}
    </div>
  );
}

export default TransactionItem;
