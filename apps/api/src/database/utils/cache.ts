export function applyDefaultCache<T>(builder: T, tag: string, ttlSeconds: number): T {
  const cacheCapable = builder as T & { $withCache?: (config?: unknown) => T };

  if (typeof cacheCapable.$withCache !== 'function') {
    return builder;
  }

  return cacheCapable.$withCache({
    config: { ex: ttlSeconds },
    tag,
  });
}
