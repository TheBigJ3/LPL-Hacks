import { Redis as IORedis, type RedisOptions } from "ioredis";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const REDIS_HOST: string = requireEnv("REDIS_HOST");
const REDIS_PORT: number = requireEnv("REDIS_PORT", "number");
// Optional: ElastiCache without an AUTH token / RBAC password has no credential,
// so treat an empty/absent value as "no password" instead of throwing.
const REDIS_PASSWORD: string | undefined = process.env.REDIS_PASSWORD || undefined;
// Optional: ElastiCache in-transit encryption needs a TLS handshake. ioredis
// enables TLS by the presence of a `tls` option, so only add it when asked.
const REDIS_TLS: boolean = process.env.REDIS_TLS === "true";

// One place that builds the connection options so `redis_client`, every
// `createRedisConnection()`, and the socket adapter's `.duplicate()` all share
// the same host/auth/TLS settings.
function redisOptions(): RedisOptions {
    return {
        host: REDIS_HOST,
        port: REDIS_PORT,
        ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
        // ElastiCache serves a cert for the cluster endpoint; the default SNI/host
        // verification against that endpoint is what we want, so no custom CA.
        ...(REDIS_TLS ? { tls: {} } : {}),
        // BullMQ requires this to be null on any connection a Worker/QueueEvents uses.
        maxRetriesPerRequest: null,
    };
}

export const redis_client = new IORedis(redisOptions());

// Producers can share `redis_client`, but every BullMQ Worker/QueueEvents needs
// its OWN connection because it parks on a blocking command. Mint a fresh one.
export function createRedisConnection() {
    return new IORedis(redisOptions());
}
