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

export const fetchTransactions = async (month: string): Promise<Transaction[]> => {
  const response = await client.get<ApiResponse<Transaction[]>>('/transactions', {
    params: { month },
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
