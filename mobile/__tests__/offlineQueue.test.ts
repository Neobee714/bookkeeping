import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearQueue,
  enqueue,
  getQueueCounts,
  markFailed,
  readQueue,
  removeFromQueue,
  retryFailed,
} from '../src/offline/queue';
import { QUEUE_LIMIT, type PendingTransaction } from '../src/offline/types';

const makeItem = (
  clientId: string,
  overrides: Partial<PendingTransaction> = {},
): PendingTransaction => ({
  clientId,
  payload: {
    amount: 12.5,
    type: 'expense',
    category: '餐饮',
    note: '午饭',
    date: '2026-10-23',
  },
  createdAt: new Date('2026-10-23T12:00:00.000Z').toISOString(),
  status: 'pending',
  attempts: 0,
  ...overrides,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('同一 clientId 重复入队只保留一条', async () => {
  expect((await enqueue(1, makeItem('a'))).ok).toBe(true);
  expect((await enqueue(1, makeItem('a'))).ok).toBe(true);

  const queue = await readQueue(1);
  expect(queue).toHaveLength(1);
  expect(queue[0].clientId).toBe('a');
});

test('不同用户的队列互相隔离', async () => {
  await enqueue(1, makeItem('a'));
  await enqueue(2, makeItem('b'));

  expect((await readQueue(1)).map((item) => item.clientId)).toEqual(['a']);
  expect((await readQueue(2)).map((item) => item.clientId)).toEqual(['b']);
});

test('移除、标记失败与重试', async () => {
  await enqueue(1, makeItem('a'));
  await enqueue(1, makeItem('b'));

  await markFailed(1, 'a', '分类不存在');
  let counts = await getQueueCounts(1);
  expect(counts).toEqual({ pending: 1, failed: 1, total: 2 });

  const failed = (await readQueue(1)).find((item) => item.clientId === 'a');
  expect(failed?.status).toBe('failed');
  expect(failed?.error).toBe('分类不存在');
  expect(failed?.attempts).toBe(1);

  await retryFailed(1);
  counts = await getQueueCounts(1);
  expect(counts).toEqual({ pending: 2, failed: 0, total: 2 });

  await removeFromQueue(1, 'a');
  expect((await readQueue(1)).map((item) => item.clientId)).toEqual(['b']);
});

test('超过上限拒绝入队', async () => {
  for (let index = 0; index < QUEUE_LIMIT; index += 1) {
    expect((await enqueue(1, makeItem(`id-${index}`))).ok).toBe(true);
  }

  const overflow = await enqueue(1, makeItem('overflow'));
  expect(overflow.ok).toBe(false);
  if (!overflow.ok) {
    expect(overflow.reason).toBe('limit');
  }
  expect(await readQueue(1)).toHaveLength(QUEUE_LIMIT);
});

test('损坏的存储内容自动丢弃', async () => {
  await AsyncStorage.setItem('bk.offline.v1.queue.1', 'not-json');
  expect(await readQueue(1)).toEqual([]);

  await enqueue(1, makeItem('a'));
  await clearQueue(1);
  expect(await readQueue(1)).toEqual([]);
});
