import type { TransactionCreatePayload } from '../types';

/** 本地缓存结构版本；结构变化时 +1，旧缓存自动失效。 */
export const CACHE_VERSION = 1;

/** 待同步队列上限，避免离线无限堆积。 */
export const QUEUE_LIMIT = 200;

/** 缓存外层信封：版本 + 写入时间 + 数据。 */
export interface CacheEnvelope<T> {
  v: number;
  at: number;
  data: T;
}

export type PendingStatus = 'pending' | 'failed';

/** 一笔待同步的离线新增。 */
export interface PendingTransaction {
  clientId: string;
  payload: TransactionCreatePayload;
  createdAt: string;
  status: PendingStatus;
  attempts: number;
  error?: string;
}

export interface SyncResult {
  synced: number;
  failed: number;
  remaining: number;
}
