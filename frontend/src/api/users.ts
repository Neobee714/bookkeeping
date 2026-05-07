import client from '@/api/client';
import type { AdminUser, ApiResponse } from '@/types';

const assertSuccess = <T>(response: ApiResponse<T>): T => {
  if (!response.success) {
    throw new Error(response.message || '请求失败');
  }
  return response.data;
};

export const getAdminUsers = async (): Promise<AdminUser[]> => {
  const response = await client.get<ApiResponse<AdminUser[]>>('/api/v1/users');
  return assertSuccess(response.data);
};
