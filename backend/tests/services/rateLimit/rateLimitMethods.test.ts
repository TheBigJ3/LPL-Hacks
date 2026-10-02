import { beforeEach, describe, expect, it, vi } from "vitest";

const { redisEval } = vi.hoisted(() => ({ redisEval: vi.fn() }));

vi.mock("../../../loaders/redisLoader.js", () => ({ redis_client: { eval: redisEval } }));

const { rateLimitConsume } = await import("../../../services/rateLimit/rateLimitMethods.js");
const { default: WebsiteSettings } = await import("../../../config/Settings.js");

const { ANON_CAPACITY, ANON_REFILL_PER_SEC, AUTH_CAPACITY, AUTH_REFILL_PER_SEC } = WebsiteSettings.RATE_LIMIT;
const USER_ID = "55555555-5555-4555-8555-555555555555";

const bucketKey = () => redisEval.mock.calls[0][2];

beforeEach(() => {
  vi.clearAllMocks();
  redisEval.mockResolvedValue([1, 99, 0]);
});

describe("rateLimitConsume", () => {
  it("spends from the user's bucket at the signed-in rate", async () => {
    await rateLimitConsume(USER_ID, "203.0.113.7", 3);

    expect(redisEval).toHaveBeenCalledWith(expect.any(String), 1, `rate_limit:user:${USER_ID}`, AUTH_CAPACITY, AUTH_REFILL_PER_SEC, 3);
  });

  it("spends from the address's bucket at the anonymous rate", async () => {
    await rateLimitConsume(undefined, "203.0.113.7", 1);

    expect(redisEval).toHaveBeenCalledWith(expect.any(String), 1, "rate_limit:ip:203.0.113.7", ANON_CAPACITY, ANON_REFILL_PER_SEC, 1);
  });

  it("treats an IPv4-mapped IPv6 address as the IPv4 address", async () => {
    await rateLimitConsume(undefined, "::ffff:203.0.113.7", 1);

    expect(bucketKey()).toBe("rate_limit:ip:203.0.113.7");
  });

  it("shares one bucket across a whole IPv6 /64", async () => {
    await rateLimitConsume(undefined, "2001:db8:1:2:aaaa:bbbb:cccc:dddd", 1);
    await rateLimitConsume(undefined, "2001:db8:1:2::1", 1);

    expect(redisEval.mock.calls[0][2]).toBe("rate_limit:ip:20010db8000100020000000000000000/64");
    expect(redisEval.mock.calls[1][2]).toBe(redisEval.mock.calls[0][2]);
  });

  it("gives a neighbouring IPv6 /64 its own bucket", async () => {
    await rateLimitConsume(undefined, "2001:db8:1:2::1", 1);
    await rateLimitConsume(undefined, "2001:db8:1:3::1", 1);

    expect(redisEval.mock.calls[1][2]).not.toBe(redisEval.mock.calls[0][2]);
  });

  it("reports an exhausted bucket with how long to wait", async () => {
    redisEval.mockResolvedValue([0, 0, 2]);

    await expect(rateLimitConsume(USER_ID, "203.0.113.7", 5)).resolves.toEqual({ allowed: false, remaining: 0, retryAfter: 2 });
  });

  it("reports what is left after an allowed request", async () => {
    await expect(rateLimitConsume(USER_ID, "203.0.113.7", 1)).resolves.toEqual({ allowed: true, remaining: 99, retryAfter: 0 });
  });
});
