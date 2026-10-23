import axios from 'axios';

import { createTransaction } from '../api/transactions';
import { extractErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { getQueueCounts, markFailed, markPending, readQueue, removeFromQueue } from './queue';
import { isOnlineNow } from './network';
import type { SyncResult } from './types';

/** 同一时刻只允许一轮同步（启动/联网/回前台可能同时触发）。 */
let activeSync: { userId: number; promise: Promise<SyncResult> } | null = null;

/**
 * 4xx 中的“数据本身有问题”（400/422）标记失败，等用户处理；
 * 401/403 是认证/权限问题，停止本轮，避免把整队都标成失败。
 */
function isValidationFailure(error: unknown): boolean {
  if (!axios.isAxiosError(error) || !error.response) {
    return false;
  }
  const status = error.response.status;
  return status >= 400 && status < 500 && status !== 401 && status !== 403;
}

function messageOf(error: unknown): string {
  return extractErrorMessage(error, '同步失败');
}

async function runSync(userId: number): Promise<SyncResult> {
  if (!isOnlineNow()) {
    const counts = await getQueueCounts(userId);
    return { synced: 0, failed: 0, remaining: counts.total };
  }

  const queue = (await readQueue(userId))
    .filter((item) => item.status === 'pending')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    // 账号切换后不能用新账号的 token 去上传上一个账号的队列。
    if (useAuthStore.getState().user?.id !== userId) {
      break;
    }
    try {
      await createTransaction({
        ...item.payload,
        client_id: item.clientId,
      });
      await removeFromQueue(userId, item.clientId);
      synced += 1;
    } catch (error) {
      if (isValidationFailure(error)) {
        await markFailed(userId, item.clientId, messageOf(error));
        failed += 1;
        continue;
      }
      // 网络 / 5xx / 401 / 403：停止本轮，保持 pending，等下次触发。
      await markPending(userId, item.clientId);
      break;
    }
  }

  const counts = await getQueueCounts(userId);
  return { synced, failed, remaining: counts.total };
}

export function syncQueue(userId: number): Promise<SyncResult> {
  if (activeSync?.userId === userId) {
    return activeSync.promise;
  }
  let promise!: Promise<SyncResult>;
  promise = runSync(userId).finally(() => {
    if (activeSync?.promise === promise) {
      activeSync = null;
    }
  });
  activeSync = { userId, promise };
  return promise;
}

/** 供测试重置单飞状态。 */
export function __resetSyncForTests(): void {
  activeSync = null;
}
