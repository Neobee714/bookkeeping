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

const categoryIconBg: Record<Category, string> = {
  餐饮: 'rgba(255,149,0,0.12)',
  交通: 'rgba(0,122,255,0.12)',
  日用: 'rgba(88,86,214,0.12)',
  娱乐: 'rgba(255,45,85,0.12)',
  医疗: 'rgba(52,199,89,0.12)',
  教育: 'rgba(90,200,250,0.12)',
  购物: 'rgba(175,82,222,0.12)',
  收入: 'rgba(52,199,89,0.12)',
  其他: 'rgba(142,142,147,0.16)',
};

interface TransactionItemProps {
  item: Transaction;
  deleting: boolean;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

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

  const amountText = `${item.type === 'income' ? '+¥ ' : '-¥ '}${item.amount.toLocaleString()}`;
  const amountColor = item.type === 'income' ? '#34C759' : '#FF3B30';

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseDown={startLongPress}
      onMouseUp={stopLongPress}
      onMouseLeave={stopLongPress}
      onTouchStart={startLongPress}
      onTouchEnd={stopLongPress}
      onTouchCancel={stopLongPress}
      onClick={handleClick}
      className="flex items-center gap-3 border-b border-[rgba(60,60,67,0.08)] py-3 last:border-b-0"
    >
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl"
        style={{ background: categoryIconBg[item.category] }}
      >
        {categoryEmojiMap[item.category]}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-medium text-[#1C1C1E]">{item.category}</p>
        <p className="mt-0.5 truncate text-[13px] text-[#8E8E93]">{item.note || '无备注'}</p>
      </div>

      {showDeleteAction ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDelete}
            className="h-8 rounded-[10px] border border-[rgba(60,60,67,0.12)] bg-white/60 px-3 text-xs text-[#8E8E93]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={handleDeleteClick}
            className="h-8 rounded-[10px] bg-[#FF3B30] px-3 text-xs font-medium text-white disabled:opacity-60"
          >
            {deleting ? '删除中' : '删除'}
          </button>
        </div>
      ) : (
        <div
          className="flex-shrink-0 text-[17px] font-semibold tracking-tight"
          style={{ color: amountColor }}
        >
          {amountText}
        </div>
      )}
    </div>
  );
}

export default TransactionItem;
