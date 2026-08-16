import type {
  ApiResponse,
  Transaction,
  TransactionCreatePayload,
  TransactionUpdatePayload,
} from '../types';
import client, { unwrap } from './client';

export interface TransactionPeriodQuery {
  month: string;
  startDate?: string;
  endDate?: string;
}

const buildQueryParams = (
  period: string | TransactionPeriodQuery,
): Record<string, string> => {
  if (typeof period === 'string') {
    return { month: period };
  }
  return {
    month: period.month,
    ...(period.startDate ? { start_date: period.startDate } : {}),
    ...(period.endDate ? { end_date: period.endDate } : {}),
  };
};

export const fetchTransactions = async (
  period: string | TransactionPeriodQuery,
): Promise<Transaction[]> => {
  const response = await client.get<ApiResponse<Transaction[]>>('/transactions', {
    params: buildQueryParams(period),
  });
  return unwrap(response.data);
};

/** 伴侣的账单(需已绑定伴侣;未绑定时后端返回 403)。 */
export const fetchPartnerTransactions = async (
  period: string | TransactionPeriodQuery,
): Promise<Transaction[]> => {
  const response = await client.get<ApiResponse<Transaction[]>>(
    '/transactions/partner',
    { params: buildQueryParams(period) },
  );
  return unwrap(response.data);
};

export const createTransaction = async (
  payload: TransactionCreatePayload,
): Promise<Transaction> => {
  const response = await client.post<ApiResponse<Transaction>>(
    '/transactions',
    payload,
  );
  return unwrap(response.data);
};

export const updateTransaction = async (
  transactionId: number,
  payload: TransactionUpdatePayload,
): Promise<Transaction> => {
  const response = await client.put<ApiResponse<Transaction>>(
    `/transactions/${transactionId}`,
    payload,
  );
  return unwrap(response.data);
};

export const removeTransaction = async (
  transactionId: number,
): Promise<{ id: number }> => {
  const response = await client.delete<ApiResponse<{ id: number }>>(
    `/transactions/${transactionId}`,
  );
  return unwrap(response.data);
};
