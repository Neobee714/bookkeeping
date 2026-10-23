import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  cacheKey,
  clearUserCache,
  readCache,
  removeCache,
  writeCache,
} from '../src/offline/cache';

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('写入后可读回，且带版本信封', async () => {
  const key = cacheKey(1, 'tx', 'self', '2026-10');
  await writeCache(key, [{ id: 1 }]);

  expect(await readCache(key)).toEqual([{ id: 1 }]);
  const raw = JSON.parse((await AsyncStorage.getItem(key)) as string);
  expect(raw.v).toBe(1);
  expect(typeof raw.at).toBe('number');
});

test('版本不匹配时返回 null 并清理', async () => {
  const key = cacheKey(1, 'tx', 'self', '2026-10');
  await AsyncStorage.setItem(key, JSON.stringify({ v: 0, at: 1, data: [] }));

  expect(await readCache(key)).toBeNull();
  expect(await AsyncStorage.getItem(key)).toBeNull();
});

test('损坏 JSON 返回 null 并清理', async () => {
  const key = cacheKey(1, 'categories');
  await AsyncStorage.setItem(key, '{oops');

  expect(await readCache(key)).toBeNull();
  expect(await AsyncStorage.getItem(key)).toBeNull();
});

test('clearUserCache 只清当前用户，保留其他用户与队列', async () => {
  const user1Tx = cacheKey(1, 'tx', 'self', '2026-10');
  const user2Tx = cacheKey(2, 'tx', 'self', '2026-10');
  const queueKey = 'bk.offline.v1.queue.1';

  await writeCache(user1Tx, [1]);
  await writeCache(user2Tx, [2]);
  await AsyncStorage.setItem(queueKey, '[]');

  await clearUserCache(1);

  expect(await readCache(user1Tx)).toBeNull();
  expect(await readCache(user2Tx)).toEqual([2]);
  expect(await AsyncStorage.getItem(queueKey)).toBe('[]');
});

test('removeCache 删除指定 key', async () => {
  const key = cacheKey(1, 'summary', 'self', '2026-10');
  await writeCache(key, { total: 1 });
  await removeCache(key);
  expect(await readCache(key)).toBeNull();
});
