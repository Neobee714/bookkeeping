import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../src/api/transactions', () => ({
  createTransaction: jest.fn(),
}));

jest.mock('../src/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 1 } }),
  },
}));

import { createTransaction } from '../src/api/transactions';
import { enqueue, readQueue } from '../src/offline/queue';
import { __resetSyncForTests, syncQueue } from '../src/offline/sync';
import type { PendingTransaction } from '../src/offline/types';
import type { Transaction } from '../src/types';

const mockedCreate = createTransaction as jest.MockedFunction<
  typeof createTransaction
>;

const makeItem = (clientId: string): PendingTransaction => ({
  clientId,
  payload: {
    amount: 12.5,
    type: 'expense',
    category: '餐饮',
    note: '午饭',
    date: '2026-10-23',
  },
  createdAt: new Date().toISOString(),
  status: 'pending',
  attempts: 0,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  __resetSyncForTests();
});

test('按顺序上传并在成功后移除队列', async () => {
  mockedCreate.mockResolvedValue({ id: 1 } as Transaction);
  await enqueue(1, makeItem('a'));
  await enqueue(1, makeItem('b'));

  const result = await syncQueue(1);

  expect(result).toEqual({ synced: 2, failed: 0, remaining: 0 });
  expect(await readQueue(1)).toEqual([]);
  expect(mockedCreate).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ client_id: 'a' }),
  );
  expect(mockedCreate).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ client_id: 'b' }),
  );
});

test('4xx 标记 failed 并保留错误原因', async () => {
  mockedCreate.mockRejectedValue({
    isAxiosError: true,
    response: { status: 422, data: { detail: '分类不存在' } },
  });
  await enqueue(1, makeItem('a'));

  const result = await syncQueue(1);

  expect(result).toEqual({ synced: 0, failed: 1, remaining: 1 });
  const queue = await readQueue(1);
  expect(queue[0].status).toBe('failed');
  expect(queue[0].error).toBe('分类不存在');
});

test('网络错误保持 pending，等待下次重试', async () => {
  mockedCreate.mockRejectedValue({
    isAxiosError: true,
    message: 'Network Error',
  });
  await enqueue(1, makeItem('a'));

  const result = await syncQueue(1);

  expect(result).toEqual({ synced: 0, failed: 0, remaining: 1 });
  const queue = await readQueue(1);
  expect(queue[0].status).toBe('pending');
  expect(queue[0].attempts).toBe(1);
});

test('同一时刻只跑一轮（单飞）', async () => {
  const deferred: { resolve: (value: Transaction) => void } = {
    resolve: () => undefined,
  };
  let markStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  mockedCreate.mockImplementation(
    () =>
      new Promise<Transaction>((resolve) => {
        deferred.resolve = resolve;
        markStarted();
      }),
  );
  await enqueue(1, makeItem('a'));

  const first = syncQueue(1);
  const second = syncQueue(1);
  expect(first).toBe(second);

  await started;
  deferred.resolve({ id: 1 } as Transaction);
  await first;
});
