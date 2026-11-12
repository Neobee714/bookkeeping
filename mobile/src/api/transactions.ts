import type {
  ApiResponse,
  NoteCandidateList,
  ReclassifyPayload,
  ReclassifyResult,
  UndoCleanupResult,
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

/**
 * 旧备注整理候选：只包含 note_kind IS NULL 的历史备注，
 * 按出现次数 / 金额降序，后端最多返回 limit 条（1–100）。
 */
export const fetchNoteCandidates = async (
  limit: number = 50,
): Promise<NoteCandidateList> => {
  const response = await client.get<ApiResponse<NoteCandidateList>>(
    '/transactions/note-candidates',
    { params: { limit } },
  );
  return unwrap(response.data);
};

/**
 * 把一条旧备注批量归类：只影响统计字段，不改金额 / 日期 / 分类。
 * action=skip 时后端返回 affected=0。
 */
export const reclassifyNote = async (
  payload: ReclassifyPayload,
): Promise<ReclassifyResult> => {
  const response = await client.post<ApiResponse<ReclassifyResult>>(
    '/transactions/notes/reclassify',
    payload,
  );
  return unwrap(response.data);
};

/**
 * 撤销一次旧备注整理（默认最近一批）。
 * 只恢复仍保持整理后状态的行；整理后又被编辑过的行会跳过。
 */
export const undoNoteCleanup = async (
  batchId?: number,
): Promise<UndoCleanupResult> => {
  const response = await client.post<ApiResponse<UndoCleanupResult>>(
    '/transactions/notes/undo',
    batchId === undefined ? {} : { batch_id: batchId },
  );
  return unwrap(response.data);
};
