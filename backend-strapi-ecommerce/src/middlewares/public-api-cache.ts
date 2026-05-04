type CacheEntry = {
  body: unknown;
  contentType?: string;
  expiresAt: number;
  status: number;
};

const cache = new Map<string, CacheEntry>();

const DEFAULT_TTL_MS = 300_000;
const MAX_ENTRIES = 100;

const PUBLIC_CACHE_PATHS = [
  "/api/home-page",
  "/api/products",
  "/api/promotions/available",
  "/api/reviews",
];

function isCacheableRequest(ctx: any) {
  if (ctx.method !== "GET") return false;
  if (ctx.get("authorization")) return false;

  return PUBLIC_CACHE_PATHS.some((path) => ctx.path === path);
}

function pruneCache(now: number) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }

  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

export default (_config: unknown, { strapi }: { strapi: any }) => {
  const ttlMs = Number(strapi.config.get("server.publicApiCacheTtlMs", DEFAULT_TTL_MS));

  return async (ctx: any, next: () => Promise<void>) => {
    if (!isCacheableRequest(ctx)) {
      await next();
      return;
    }

    const now = Date.now();
    const key = ctx.URL.pathname + ctx.URL.search;
    const cached = cache.get(key);

    if (cached && cached.expiresAt > now) {
      ctx.status = cached.status;
      if (cached.contentType) ctx.type = cached.contentType;
      ctx.set("X-API-Cache", "HIT");
      ctx.body = cached.body;
      return;
    }

    await next();

    if (ctx.status === 200 && ctx.body) {
      pruneCache(now);
      cache.set(key, {
        body: ctx.body,
        contentType: ctx.response.type,
        expiresAt: Date.now() + ttlMs,
        status: ctx.status,
      });
      ctx.set("X-API-Cache", "MISS");
    }
  };
};
