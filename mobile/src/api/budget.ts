import type {
  ApiResponse,
  Budget,
  BudgetCreatePayload,
  BudgetSummary,
  BudgetUpdatePayload,
} from '../types';
import client, { unwrap } from './client';

export const fetchBudget = async (month: string): Promise<BudgetSummary> => {
  const response = await client.get<ApiResponse<BudgetSummary>>('/budget', {
    params: { month },
  });
  return unwrap(response.data);
};

export const setBudget = async (
  payload: BudgetCreatePayload,
): Promise<Budget> => {
  const response = await client.post<ApiResponse<Budget>>('/budget', payload);
  return unwrap(response.data);
};

export const updateBudget = async (
  budgetId: number,
  payload: BudgetUpdatePayload,
): Promise<Budget> => {
  const response = await client.put<ApiResponse<Budget>>(
    `/budget/${budgetId}`,
    payload,
  );
  return unwrap(response.data);
};
