import AsyncStorage from '@react-native-async-storage/async-storage';

import { CACHE_VERSION, type CacheEnvelope } from './types';

const PREFIX = 'bk.cache.v1';

/** 统一 cache key：包含用户，避免两个账号互相看到缓存。 */
export function cacheKey(
  userId: number,
  ...parts: Array<string | number>
): string {
  return [PREFIX, userId, ...parts].join('.');
}

/**
 * 读取缓存。
 * - 不存在 / JSON 损坏 / 版本不匹配 → 返回 null，并清掉坏数据。
 */
export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CacheEnvelope<T> | null;
    if (!parsed || parsed.v !== CACHE_VERSION) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    await AsyncStorage.removeItem(key).catch(() => undefined);
    return null;
  }
}

/** 写缓存；失败静默（缓存不是主路径，不能阻塞 UI）。 */
export async function writeCache<T>(key: string, data: T): Promise<void> {
  const envelope: CacheEnvelope<T> = {
    v: CACHE_VERSION,
    at: Date.now(),
    data,
  };
  try {
    await AsyncStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // 存储满 / 被系统清理：忽略，下次网络请求会重试
  }
}

export async function removeCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** 登出时清掉该用户的全部缓存（队列单独保留）。 */
export async function clearUserCache(userId: number): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const prefix = `${PREFIX}.${userId}.`;
    const targets = keys.filter((key) => key.startsWith(prefix));
    if (targets.length > 0) {
      await Promise.all(targets.map((key) => AsyncStorage.removeItem(key)));
    }
  } catch {
    // ignore
  }
}
