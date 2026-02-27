type CacheKey = string;

export type PageCacheEntry = {
  html: string;
  fetchedAt: number;
};

/**
 * Tiny in-memory LRU cache for rendered page HTML.
 * Keeps the last N pages for instant back/forward.
 */
export class LruPageCache {
  private max: number;
  private map = new Map<CacheKey, PageCacheEntry>();

  constructor(max = 20) {
    this.max = Math.max(1, max);
  }

  get(key: CacheKey): PageCacheEntry | undefined {
    const v = this.map.get(key);
    if (!v) return;
    // bump recency
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: CacheKey, value: PageCacheEntry) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);

    while (this.map.size > this.max) {
      const oldestKey = this.map.keys().next().value as CacheKey | undefined;
      if (!oldestKey) break;
      this.map.delete(oldestKey);
    }
  }
}

export function pageKey(bookId: string, pageNo: number) {
  return `${bookId}|${pageNo}`;
}

export type PrefetchOptions = {
  maxConcurrent?: number;
  allow?: boolean;
};

const inflight = new Set<string>();

/**
 * Best-effort prefetch (network) to warm browser HTTP cache.
 * This doesn't guarantee caching, but in practice helps a lot.
 */
export async function prefetchPage(url: string, opts: PrefetchOptions = {}): Promise<void> {
  if (opts.allow === false) return;
  const maxConcurrent = Math.max(1, opts.maxConcurrent ?? 2);
  if (inflight.has(url)) return;
  if (inflight.size >= maxConcurrent) return;

  inflight.add(url);
  try {
    await fetch(url, { cache: "force-cache" });
  } catch {
    // ignore
  } finally {
    inflight.delete(url);
  }
}

export function shouldAllowPrefetch(): boolean {
  try {
    // @ts-ignore
    const c = navigator?.connection;
    if (c?.saveData) return false;
    const et = String(c?.effectiveType ?? "");
    if (et === "2g") return false;
    return document.visibilityState === "visible";
  } catch {
    return true;
  }
}
