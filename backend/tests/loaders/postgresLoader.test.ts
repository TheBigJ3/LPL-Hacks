import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiCalls, jobPool } = vi.hoisted(() => {
  const apiCalls: string[] = [];
  return {
    apiCalls,
    jobPool: { query: vi.fn(async () => "job-result"), connect: vi.fn(async () => "job-client") },
  };
});

vi.mock("pg", () => {
  class Pool {
    on = vi.fn();
    async query() {
      apiCalls.push("query");
      return "api-result";
    }
    async connect() {
      apiCalls.push("connect");
      return "api-client";
    }
  }
  return { default: { Pool, types: { setTypeParser: vi.fn() } } };
});
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: vi.fn(() => ({})) }));
vi.mock("../../modules/postgresPoolConfig.js", () => ({ postgresPoolConfig: vi.fn(() => ({})) }));
vi.mock("../../loaders/jobPostgresLoader.js", () => ({ job_postgres_pool: jobPool }));
vi.mock("../../loaders/rdsSignerLoader.js", () => ({ rds_signer: { getAuthToken: vi.fn(async () => "iam-token") } }));

const { postgres_pool } = await import("../../loaders/postgresLoader.js");
const { jobScope } = await import("../../modules/jobScope.js");

beforeEach(() => {
  vi.clearAllMocks();
  apiCalls.length = 0;
});

describe("postgres_pool", () => {
  it("serves a request's queries and transactions from its own connections", async () => {
    await expect(postgres_pool.query("select 1")).resolves.toBe("api-result");
    await expect(postgres_pool.connect()).resolves.toBe("api-client");

    expect(apiCalls).toEqual(["query", "connect"]);
    expect(jobPool.query).not.toHaveBeenCalled();
    expect(jobPool.connect).not.toHaveBeenCalled();
  });

  it("sends everything a job runs to the job pool", async () => {
    const results = await jobScope.run(true, async () => [await postgres_pool.query("select 1", [2]), await postgres_pool.connect()]);

    expect(results).toEqual(["job-result", "job-client"]);
    expect(jobPool.query).toHaveBeenCalledWith("select 1", [2]);
    expect(apiCalls).toEqual([]);
  });
});
