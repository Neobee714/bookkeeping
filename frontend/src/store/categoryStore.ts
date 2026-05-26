import { create } from 'zustand';

import {
  createCategory,
  fetchCategories,
  removeCategory,
  updateCategory,
  type CategoryCreatePayload,
  type CategoryItem,
  type CategoryUpdatePayload,
} from '@/api/categories';

const DEFAULT_COLOR = '#8E8E93';
const DEFAULT_ICON = '📌';
const CACHE_KEY = 'categories_cache';

function loadCache(): CategoryItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CategoryItem[];
  } catch {
    return null;
  }
}

function saveCache(categories: CategoryItem[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(categories));
  } catch { /* ignore quota errors */ }
}

interface CategoryState {
  categories: CategoryItem[];
  loaded: boolean;
  fetchCategories: () => Promise<void>;
  addCategory: (payload: CategoryCreatePayload) => Promise<CategoryItem>;
  updateCategory: (id: number, payload: CategoryUpdatePayload) => Promise<CategoryItem>;
  deleteCategory: (id: number) => Promise<void>;
  expenseCategories: () => CategoryItem[];
  incomeCategories: () => CategoryItem[];
  getCategoryByName: (name: string) => CategoryItem | undefined;
  getCategoryColor: (name: string) => string;
  getCategoryIcon: (name: string) => string;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  loaded: false,

  fetchCategories: async () => {
    // 1. 先从 localStorage 读取，立即展示
    const cached = loadCache();
    if (cached) {
      set({ categories: cached, loaded: true });
    }

    // 2. 后台静默刷新 API
    try {
      const fresh = await fetchCategories();
      saveCache(fresh);
      set({ categories: fresh, loaded: true });
    } catch {
      // API 失败时，如果已有缓存则静默降级，否则标记 loaded 防止死循环
      if (!cached) {
        set({ loaded: true });
      }
    }
  },

  addCategory: async (payload) => {
    const category = await createCategory(payload);
    set((state) => {
      const next = [...state.categories, category];
      saveCache(next);
      return { categories: next };
    });
    return category;
  },

  updateCategory: async (id, payload) => {
    const category = await updateCategory(id, payload);
    set((state) => {
      const next = state.categories.map((c) => (c.id === id ? category : c));
      saveCache(next);
      return { categories: next };
    });
    return category;
  },

  deleteCategory: async (id) => {
    await removeCategory(id);
    set((state) => {
      const next = state.categories.filter((c) => c.id !== id);
      saveCache(next);
      return { categories: next };
    });
  },

  expenseCategories: () =>
    get().categories.filter((c) => c.type === 'expense'),

  incomeCategories: () =>
    get().categories.filter((c) => c.type === 'income'),

  getCategoryByName: (name) =>
    get().categories.find((c) => c.name === name),

  getCategoryColor: (name) =>
    get().categories.find((c) => c.name === name)?.color ?? DEFAULT_COLOR,

  getCategoryIcon: (name) =>
    get().categories.find((c) => c.name === name)?.icon ?? DEFAULT_ICON,
}));
