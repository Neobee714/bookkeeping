import client from '@/api/client';
import type { ApiResponse } from '@/types';

export interface CategoryItem {
  id: number;
  user_id: number;
  name: string;
  icon: string;
  color: string;
  type: string;
  is_default: boolean;
  created_at: string | null;
}

export interface CategoryCreatePayload {
  name: string;
  icon: string;
  color: string;
  type: string;
}

export interface CategoryUpdatePayload {
  name?: string;
  icon?: string;
  color?: string;
}

const assertSuccess = <T>(response: ApiResponse<T>): T => {
  if (!response.success) {
    throw new Error(response.message || '请求失败');
  }
  return response.data;
};

export const fetchCategories = async (): Promise<CategoryItem[]> => {
  const response = await client.get<ApiResponse<CategoryItem[]>>('/categories');
  return assertSuccess(response.data);
};

export const createCategory = async (
  payload: CategoryCreatePayload,
): Promise<CategoryItem> => {
  const response = await client.post<ApiResponse<CategoryItem>>('/categories', payload);
  return assertSuccess(response.data);
};

export const updateCategory = async (
  id: number,
  payload: CategoryUpdatePayload,
): Promise<CategoryItem> => {
  const response = await client.put<ApiResponse<CategoryItem>>(
    `/categories/${id}`,
    payload,
  );
  return assertSuccess(response.data);
};

export const removeCategory = async (id: number): Promise<void> => {
  const response = await client.delete<ApiResponse<null>>(`/categories/${id}`);
  assertSuccess(response.data);
};
