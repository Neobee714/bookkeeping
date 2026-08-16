import type {
  ApiResponse,
  SavingsCreatePayload,
  SavingsGoal,
  SavingsUpdatePayload,
} from '../types';
import client, { unwrap } from './client';

export const fetchSavings = async (): Promise<SavingsGoal[]> => {
  const response = await client.get<ApiResponse<SavingsGoal[]>>('/savings');
  return unwrap(response.data);
};

export const createSaving = async (
  payload: SavingsCreatePayload,
): Promise<SavingsGoal> => {
  const response = await client.post<ApiResponse<SavingsGoal>>(
    '/savings',
    payload,
  );
  return unwrap(response.data);
};

export const updateSaving = async (
  savingId: number,
  payload: SavingsUpdatePayload,
): Promise<SavingsGoal> => {
  const response = await client.put<ApiResponse<SavingsGoal>>(
    `/savings/${savingId}`,
    payload,
  );
  return unwrap(response.data);
};

export const deleteSaving = async (
  savingId: number,
): Promise<{ id: number }> => {
  const response = await client.delete<ApiResponse<{ id: number }>>(
    `/savings/${savingId}`,
  );
  return unwrap(response.data);
};
