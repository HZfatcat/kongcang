/**
 * 轻量内存缓存：无外部依赖，适合单进程开发环境
 * 不影响线上部署，不会导致 502
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const store = new Map<string, CacheEntry<any>>();

/** 每 60 秒清理一次过期条目 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiry < now) store.delete(key);
  }
}, 60_000).unref();

export function cache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 30_000,
): Promise<T> {
  const existing = store.get(key);
  if (existing && existing.expiry > Date.now()) {
    return Promise.resolve(existing.data);
  }
  return fetcher().then((data) => {
    store.set(key, { data, expiry: Date.now() + ttlMs });
    return data;
  });
}

/** 清除所有缓存（手动同步时调用） */
export function clearCache(): void {
  store.clear();
}
