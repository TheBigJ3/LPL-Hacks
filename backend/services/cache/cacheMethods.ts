import { randomUUID } from "crypto";
import { redis_client } from "../../loaders/redisLoader.js";
import { ServerError } from "../../modules/ServerError.js";

const CACHE_WHOLE_ID = "all";

// Outlives every entry it versions, so a version that expires can only fall back to entries long gone.
const CACHE_VERSION_TTL_SECONDS = 30 * 24 * 60 * 60;

// The {braces} keep an entry's version and values in one slot, so one script reads both in a single trip.
const CACHE_READ_SCRIPT = `
local version = redis.call('GET', KEYS[1]) or '0'
return {version, redis.call('GET', ARGV[1] .. version)}
`;

type CacheOptions = {
  name: string;
  shape: number;
  ttlSeconds: number;
};

const cacheNames = new Set<string>();
const cacheLoading = new Map<string, Promise<unknown>>();

export function cacheDefine<T>({ name, shape, ttlSeconds }: CacheOptions) {
  if (cacheNames.has(name)) {
    throw new ServerError(undefined, `[cache] Two caches are both named ${name}`);
  }

  if (ttlSeconds >= CACHE_VERSION_TTL_SECONDS) {
    throw new ServerError(undefined, `[cache] ${name} would outlive the version that busts it`);
  }

  cacheNames.add(name);

  const cacheBase = (id: string) => `cache:{${name}:${id}}`;
  const key = (id: string = CACHE_WHOLE_ID) => `${cacheBase(id)}:version`;

  return {
    key,
    remember: (load: () => Promise<T>, id: string = CACHE_WHOLE_ID) =>
      cacheRemember(key(id), `${cacheBase(id)}:value:${shape}:`, ttlSeconds, load),
  };
}

export async function cacheBust(...keys: string[]): Promise<void> {
  const bust = redis_client.pipeline();
  keys.forEach((key) => bust.set(key, randomUUID(), "EX", CACHE_VERSION_TTL_SECONDS));

  try {
    const results = await bust.exec();
    const failed = results?.find(([error]) => error);

    if (failed) throw failed[0];
  } catch (error) {
    // The write already committed; a missed bust only leaves the entry stale until its TTL.
    console.error(`[cache] Could not bust ${keys.join(", ")}:`, error);
  }
}

async function cacheRemember<T>(versionKey: string, valuePrefix: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  let version: string;

  try {
    const [current, cached] = await redis_client.eval(CACHE_READ_SCRIPT, 1, versionKey, valuePrefix) as [string, string | null];

    if (cached !== null) return JSON.parse(cached) as T;

    version = current;
  } catch (error) {
    // An unreadable cache only makes the request slower, never the reason it fails.
    console.error(`[cache] Could not read ${versionKey}:`, error);
    return load();
  }

  const valueKey = `${valuePrefix}${version}`;
  const inFlight = cacheLoading.get(valueKey);

  if (inFlight) return inFlight as Promise<T>;

  const loading = cacheLoadAndStore(valueKey, ttlSeconds, load).finally(() => cacheLoading.delete(valueKey));
  cacheLoading.set(valueKey, loading);

  return loading;
}

async function cacheLoadAndStore<T>(valueKey: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const value = await load();

  redis_client.set(valueKey, JSON.stringify(value), "EX", ttlSeconds).catch((error) => {
    console.error(`[cache] Could not store ${valueKey}:`, error);
  });

  return value;
}
