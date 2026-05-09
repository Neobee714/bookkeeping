import { useEffect, useRef, useState } from 'react';

/**
 * Module-level cache, shared across component mounts. When a page unmounts
 * (e.g. user switches bottom tab), local useState is lost — but the cache
 * survives, so the next mount can render the last known data immediately
 * while silently refetching in the background.
 */
const cache = new Map<string, unknown>();

export interface CachedResource<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useCachedResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): CachedResource<T> {
  const [data, setData] = useState<T | undefined>(() => cache.get(key) as T | undefined);
  const [loading, setLoading] = useState<boolean>(() => !cache.has(key));
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const runFetch = async () => {
    try {
      const result = await fetcherRef.current();
      cache.set(key, result);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = cache.get(key) as T | undefined;
    if (cached !== undefined) {
      setData(cached);
      setLoading(false);
    } else {
      setData(undefined);
      setLoading(true);
    }
    setError(null);
    void runFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  return { data, loading, error, refresh: runFetch };
}

export function invalidateCache(predicate?: (key: string) => boolean): void {
  if (!predicate) {
    cache.clear();
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (predicate(key)) {
      cache.delete(key);
    }
  }
}

export function setCachedValue<T>(key: string, value: T): void {
  cache.set(key, value);
}
