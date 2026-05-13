import client from '@/api/client';
import type {
  ApiResponse,
  Transaction,
  TransactionCreatePayload,
  TransactionImportResult,
  TransactionUpdatePayload,
} from '@/types';

const assertSuccess = <T>(response: ApiResponse<T>): T => {
  if (!response.success) {
    throw new Error(response.message || '请求失败');
  }
  return response.data;
};

interface TransactionPeriodQuery {
  month: string;
  startDate?: string;
  endDate?: string;
}

const buildTransactionQueryParams = (
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
    params: buildTransactionQueryParams(period),
  });
  return assertSuccess(response.data);
};

export const createTransaction = async (
  payload: TransactionCreatePayload,
): Promise<Transaction> => {
  const response = await client.post<ApiResponse<Transaction>>('/transactions', payload);
  return assertSuccess(response.data);
};

export const updateTransaction = async (
  transactionId: number,
  payload: TransactionUpdatePayload,
): Promise<Transaction> => {
  const response = await client.put<ApiResponse<Transaction>>(
    `/transactions/${transactionId}`,
    payload,
  );
  return assertSuccess(response.data);
};

export const removeTransaction = async (
  transactionId: number,
): Promise<{ id: number }> => {
  const response = await client.delete<ApiResponse<{ id: number }>>(
    `/transactions/${transactionId}`,
  );
  return assertSuccess(response.data);
};

export const importTransactions = async (
  file: File,
): Promise<TransactionImportResult> => {
  const form = new FormData();
  form.append('file', file);

  const response = await client.post<ApiResponse<TransactionImportResult>>(
    '/transactions/import',
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );

  return assertSuccess(response.data);
};
