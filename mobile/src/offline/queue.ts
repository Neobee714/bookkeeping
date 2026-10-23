import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  QUEUE_LIMIT,
  type PendingTransaction,
  type PendingStatus,
} from './types';

const PREFIX = 'bk.offline.v1.queue';

const queueKey = (userId: number): string => `${PREFIX}.${userId}`;

/**
 * 队列读改写串行化。
 * 两个操作同时 read-modify-write 会互相覆盖（例如入队的同时同步完成移除），
 * 所以所有 mutation 走同一条 Promise 链。
 */
let mutationChain: Promise<void> = Promise.resolve();

function withLock<T>(task: () => Promise<T>): Promise<T> {
  const result = mutationChain.then(task, task);
  mutationChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function isPendingTransaction(value: unknown): value is PendingTransaction {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const item = value as Partial<PendingTransaction>;
  return (
    typeof item.clientId === 'string' &&
    item.clientId.length > 0 &&
    !!item.payload &&
    typeof item.payload === 'object' &&
    typeof item.createdAt === 'string' &&
    (item.status === 'pending' || item.status === 'failed') &&
    typeof item.attempts === 'number'
  );
}

async function readQueueRaw(userId: number): Promise<PendingTransaction[]> {
  try {
    const raw = await AsyncStorage.getItem(queueKey(userId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      await AsyncStorage.removeItem(queueKey(userId));
      return [];
    }
    return parsed.filter(isPendingTransaction);
  } catch {
    await AsyncStorage.removeItem(queueKey(userId)).catch(() => undefined);
    return [];
  }
}

async function writeQueueRaw(
  userId: number,
  queue: PendingTransaction[],
): Promise<void> {
  // 不吞异常：写入失败必须让调用方知道，否则会误报“已离线保存”但实际没落盘。
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(queue));
}

export async function readQueue(userId: number): Promise<PendingTransaction[]> {
  return readQueueRaw(userId);
}

export type EnqueueResult =
  | { ok: true; queue: PendingTransaction[] }
  | { ok: false; reason: 'limit'; queue: PendingTransaction[] };

/** 入队；同一 clientId 重复入队视为成功（幂等，不新增）。 */
export function enqueue(
  userId: number,
  item: PendingTransaction,
): Promise<EnqueueResult> {
  return withLock(async () => {
    const queue = await readQueueRaw(userId);
    if (queue.some((entry) => entry.clientId === item.clientId)) {
      return { ok: true, queue };
    }
    if (queue.length >= QUEUE_LIMIT) {
      return { ok: false, reason: 'limit', queue };
    }
    const next = [...queue, item];
    await writeQueueRaw(userId, next);
    return { ok: true, queue: next };
  });
}

export function removeFromQueue(
  userId: number,
  clientId: string,
): Promise<void> {
  return withLock(async () => {
    const queue = await readQueueRaw(userId);
    const next = queue.filter((entry) => entry.clientId !== clientId);
    if (next.length !== queue.length) {
      await writeQueueRaw(userId, next);
    }
  });
}

async function updateStatus(
  userId: number,
  clientId: string,
  status: PendingStatus,
  error?: string,
): Promise<void> {
  await withLock(async () => {
    const queue = await readQueueRaw(userId);
    let changed = false;
    const next = queue.map((entry) => {
      if (entry.clientId !== clientId) {
        return entry;
      }
      changed = true;
      return {
        ...entry,
        status,
        attempts: entry.attempts + 1,
        error: status === 'failed' ? error : undefined,
      };
    });
    if (changed) {
      await writeQueueRaw(userId, next);
    }
  });
}

/** 4xx 校验失败：标记 failed，保留给用户手动重试/删除。 */
export function markFailed(
  userId: number,
  clientId: string,
  error: string,
): Promise<void> {
  return updateStatus(userId, clientId, 'failed', error);
}

/** 网络/5xx/401：保持 pending，仅累加尝试次数。 */
export function markPending(userId: number, clientId: string): Promise<void> {
  return updateStatus(userId, clientId, 'pending');
}

/** 把 failed 重新放回 pending（用户在横幅点“重试”）。 */
export function retryFailed(userId: number): Promise<void> {
  return withLock(async () => {
    const queue = await readQueueRaw(userId);
    let changed = false;
    const next = queue.map((entry) => {
      if (entry.status !== 'failed') {
        return entry;
      }
      changed = true;
      return { ...entry, status: 'pending' as const, error: undefined };
    });
    if (changed) {
      await writeQueueRaw(userId, next);
    }
  });
}

export function clearQueue(userId: number): Promise<void> {
  return withLock(async () => {
    await writeQueueRaw(userId, []);
  });
}

export async function getQueueCounts(
  userId: number,
): Promise<{ pending: number; failed: number; total: number }> {
  const queue = await readQueueRaw(userId);
  const failed = queue.filter((entry) => entry.status === 'failed').length;
  return {
    pending: queue.length - failed,
    failed,
    total: queue.length,
  };
}
