import client from '@/api/client';
import type {
  ApiResponse,
  SavingsCreatePayload,
  SavingsGoal,
  SavingsUpdatePayload,
} from '@/types';

const assertSuccess = <T>(response: ApiResponse<T>): T => {
  if (!response.success) {
    throw new Error(response.message || '请求失败');
  }
  return response.data;
};

export const fetchSavings = async (): Promise<SavingsGoal[]> => {
  const response = await client.get<ApiResponse<SavingsGoal[]>>('/savings');
  return assertSuccess(response.data);
};

export const createSaving = async (
  payload: SavingsCreatePayload,
): Promise<SavingsGoal> => {
  const response = await client.post<ApiResponse<SavingsGoal>>('/savings', payload);
  return assertSuccess(response.data);
};

export const updateSaving = async (
  savingId: number,
  payload: SavingsUpdatePayload,
): Promise<SavingsGoal> => {
  const response = await client.put<ApiResponse<SavingsGoal>>(
    `/savings/${savingId}`,
    payload,
  );
  return assertSuccess(response.data);
};

export const deleteSaving = async (
  savingId: number,
): Promise<{ id: number }> => {
  const response = await client.delete<ApiResponse<{ id: number }>>(`/savings/${savingId}`);
  return assertSuccess(response.data);
};
