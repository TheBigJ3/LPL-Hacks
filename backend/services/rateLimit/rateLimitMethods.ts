import { isIPv6 } from "net";
import { redis_client } from "../../loaders/redisLoader.js";
import requireSettings from "../../modules/requireSettings.js";

const { ANON_CAPACITY, ANON_REFILL_PER_SEC, AUTH_CAPACITY, AUTH_REFILL_PER_SEC, IPV6_PREFIX } = requireSettings("RATE_LIMIT");

const rateLimitKey = (identity: string) => `rate_limit:${identity}`;

// Redis TIME keeps every instance on one clock; an idle bucket expires once it would have refilled anyway.
const RATE_LIMIT_CONSUME_SCRIPT = `
local capacity = tonumber(ARGV[1])
local refillPerSec = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local time = redis.call("TIME")
local now = tonumber(time[1]) + tonumber(time[2]) / 1000000
local bucket = redis.call("HMGET", KEYS[1], "tokens", "updatedAt")
local tokens = tonumber(bucket[1]) or capacity
local updatedAt = tonumber(bucket[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - updatedAt) * refillPerSec)
local allowed = tokens >= cost
if allowed then tokens = tokens - cost end
redis.call("HSET", KEYS[1], "tokens", tostring(tokens), "updatedAt", tostring(now))
redis.call("EXPIRE", KEYS[1], math.ceil(capacity / refillPerSec))
if allowed then return {1, math.floor(tokens), 0} end
return {0, math.floor(tokens), math.ceil((cost - tokens) / refillPerSec)}
`;

export async function rateLimitConsume(userId: string | undefined, ip: string, cost: number) {
    return userId
        ? rateLimitSpend(`user:${userId}`, AUTH_CAPACITY, AUTH_REFILL_PER_SEC, cost)
        : rateLimitSpend(`ip:${rateLimitNormalizeIp(ip)}`, ANON_CAPACITY, ANON_REFILL_PER_SEC, cost);
}

async function rateLimitSpend(identity: string, capacity: number, refillPerSec: number, cost: number) {
    const [allowed, remaining, retryAfter] = await redis_client.eval(
        RATE_LIMIT_CONSUME_SCRIPT,
        1,
        rateLimitKey(identity),
        capacity,
        refillPerSec,
        cost,
    ) as [number, number, number];

    return { allowed: allowed === 1, remaining, retryAfter };
}

// One IPv6 subscriber owns a whole prefix, so keying on the full address would hand them unlimited buckets.
function rateLimitNormalizeIp(ip: string): string {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return mapped[1];

    const address = ip.split("%")[0];
    if (!isIPv6(address)) return ip;

    const hex = address.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/, (_, a, b, c, d) =>
        `${((+a << 8) | +b).toString(16)}:${((+c << 8) | +d).toString(16)}`);
    const [head, tail] = hex.split("::");
    const headGroups = head ? head.split(":") : [];
    const tailGroups = tail ? tail.split(":") : [];
    const groups = tail === undefined
        ? headGroups
        : [...headGroups, ...Array(8 - headGroups.length - tailGroups.length).fill("0"), ...tailGroups];

    const bits = groups.map((group) => parseInt(group, 16).toString(2).padStart(16, "0")).join("");
    const prefix = BigInt(`0b${bits.slice(0, IPV6_PREFIX).padEnd(128, "0")}`);

    return `${prefix.toString(16)}/${IPV6_PREFIX}`;
}
