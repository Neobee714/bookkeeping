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
    const categories = await fetchCategories();
    set({ categories, loaded: true });
  },

  addCategory: async (payload) => {
    const category = await createCategory(payload);
    set((state) => ({ categories: [...state.categories, category] }));
    return category;
  },

  updateCategory: async (id, payload) => {
    const category = await updateCategory(id, payload);
    set((state) => ({
      categories: state.categories.map((c) => (c.id === id ? category : c)),
    }));
    return category;
  },

  deleteCategory: async (id) => {
    await removeCategory(id);
    set((state) => ({
      categories: state.categories.filter((c) => c.id !== id),
    }));
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
