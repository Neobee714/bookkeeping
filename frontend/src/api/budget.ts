import client from '@/api/client';
import type {
  ApiResponse,
  Budget,
  BudgetCreatePayload,
  BudgetSummary,
  BudgetUpdatePayload,
} from '@/types';

const assertSuccess = <T>(response: ApiResponse<T>): T => {
  if (!response.success) {
    throw new Error(response.message || '请求失败');
  }
  return response.data;
};

export const fetchBudget = async (month: string): Promise<BudgetSummary> => {
  const response = await client.get<ApiResponse<BudgetSummary>>('/budget', {
    params: { month },
  });
  return assertSuccess(response.data);
};

export const setBudget = async (payload: BudgetCreatePayload): Promise<Budget> => {
  const response = await client.post<ApiResponse<Budget>>('/budget', payload);
  return assertSuccess(response.data);
};

export const updateBudget = async (
  budgetId: number,
  payload: BudgetUpdatePayload,
): Promise<Budget> => {
  const response = await client.put<ApiResponse<Budget>>(`/budget/${budgetId}`, payload);
  return assertSuccess(response.data);
};
