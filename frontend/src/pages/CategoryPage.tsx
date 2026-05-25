import axios from 'axios';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import IconPicker from '@/components/IconPicker';
import { useCategoryStore } from '@/store/categoryStore';
import type { CategoryItem } from '@/api/categories';

type TabType = 'expense' | 'income';

function CategoryPage() {
  const navigate = useNavigate();
  const {
    loaded,
    fetchCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    expenseCategories,
    incomeCategories,
  } = useCategoryStore();

  const [tab, setTab] = useState<TabType>('expense');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CategoryItem | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [iconInput, setIconInput] = useState('🍜');
  const [colorInput, setColorInput] = useState('#FF6B6B');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (!loaded) {
      void fetchCategories();
    }
  }, [loaded, fetchCategories]);

  const activeCategories = tab === 'expense' ? expenseCategories() : incomeCategories();

  const handleOpenCreate = () => {
    setEditingItem(null);
    setNameInput('');
    setIconInput(tab === 'expense' ? '🍜' : '💼');
    setColorInput(tab === 'expense' ? '#FF6B6B' : '#52C41A');
    setErrorMessage('');
    setSheetOpen(true);
  };

  const handleOpenEdit = (item: CategoryItem) => {
    setEditingItem(item);
    setNameInput(item.name);
    setIconInput(item.icon);
    setColorInput(item.color);
    setErrorMessage('');
    setSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setSheetOpen(false);
    setEditingItem(null);
    setErrorMessage('');
  };

  const handleSubmit = async () => {
    const name = nameInput.trim();
    if (!name) {
      setErrorMessage('请输入分类名称');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      if (editingItem) {
        await updateCategory(editingItem.id, { name, icon: iconInput, color: colorInput });
      } else {
        await addCategory({ name, icon: iconInput, color: colorInput, type: tab });
      }
      handleCloseSheet();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(error.response?.data?.message ?? '操作失败');
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('操作失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: CategoryItem) => {
    const confirmed = window.confirm(`确定删除分类「${item.name}」吗？`);
    if (!confirmed) {
      return;
    }

    setDeletingId(item.id);
    try {
      await deleteCategory(item.id);
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
    <section className="space-y-3 pb-2">
      <div className="ios-anim mb-1 mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(0,122,255,0.1)] text-[15px] font-semibold text-[#007AFF]"
          >
            ‹
          </button>
          <h1 className="text-[34px] font-bold tracking-tight text-[#1C1C1E]">
            分类管理
          </h1>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="h-8 rounded-[10px] bg-[#007AFF] px-3 text-xs font-medium text-white"
        >
          + 新增
        </button>
      </div>

      <div className="ios-segment ios-anim ios-anim-d1 flex">
        <button
          type="button"
          onClick={() => setTab('expense')}
          className={`ios-segment-btn ${tab === 'expense' ? 'active' : ''}`}
        >
          支出分类
        </button>
        <button
          type="button"
          onClick={() => setTab('income')}
          className={`ios-segment-btn ${tab === 'income' ? 'active' : ''}`}
        >
          收入分类
        </button>
      </div>

      <div className="ios-glass ios-anim ios-anim-d2 px-4">
        {activeCategories.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#8E8E93]">
            暂无分类
          </div>
        ) : (
          activeCategories.map((item, index) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 py-3.5 ${
                index < activeCategories.length - 1
                  ? 'border-b border-[rgba(60,60,67,0.08)]'
                  : ''
              }`}
            >
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-xl"
                style={{ background: `${item.color}1A` }}
              >
                {item.icon}
              </div>
              <div className="flex-1">
                <p className="text-[16px] font-medium text-[#1C1C1E]">
                  {item.name}
                </p>
                {item.is_default && (
                  <p className="text-[11px] text-[#8E8E93]">默认分类</p>
                )}
              </div>
              {!item.is_default && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(item)}
                    className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[rgba(118,118,128,0.08)] text-sm"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === item.id}
                    onClick={() => void handleDelete(item)}
                    className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[rgba(255,59,48,0.08)] text-sm disabled:opacity-60"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="关闭"
            onClick={handleCloseSheet}
          />
          <section className="relative w-full max-w-[430px] rounded-t-3xl bg-white px-5 pb-8 pt-4">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-[#D5D5DB]" />
            <h3 className="mt-4 text-lg font-semibold text-[#1C1C1E]">
              {editingItem ? '编辑分类' : '新增分类'}
            </h3>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs text-[#8E8E93]">名称</span>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={10}
                placeholder="分类名称"
                className="h-11 w-full rounded-[10px] border border-[rgba(60,60,67,0.12)] px-3 text-sm text-[#1C1C1E] outline-none focus:border-[#007AFF]"
              />
            </label>

            <div className="mt-4">
              <IconPicker
                selectedIcon={iconInput}
                selectedColor={colorInput}
                onSelectIcon={setIconInput}
                onSelectColor={setColorInput}
              />
            </div>

            {errorMessage && (
              <p className="mt-3 rounded-[10px] bg-[rgba(255,59,48,0.1)] px-3 py-2 text-xs text-[#FF3B30]">
                {errorMessage}
              </p>
            )}

            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleSubmit()}
              className="mt-4 h-12 w-full rounded-[12px] bg-[#007AFF] text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {submitting ? '保存中...' : '保存'}
            </button>
            <button
              type="button"
              onClick={handleCloseSheet}
              className="mt-3 h-12 w-full rounded-[12px] bg-[rgba(118,118,128,0.08)] text-[15px] font-medium text-[#1C1C1E]"
            >
              取消
            </button>
          </section>
        </div>
      )}
    </section>
  );
}

export default CategoryPage;
