import pg from "pg";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "../schemas/index.js";
import { jobScope } from "../modules/jobScope.js";
import { postgresPoolConfig } from "../modules/postgresPoolConfig.js";
import { job_postgres_pool } from "./jobPostgresLoader.js";

dotenv.config();

// Money-safe defaults: return NUMERIC as string (never a lossy JS float),
// and BIGINT (int8) as string so ledger amounts survive past 2^53.
pg.types.setTypeParser(1700, (value) => value); // numeric
pg.types.setTypeParser(20, (value) => value); // int8 / bigint

// Services are shared by routes and jobs, so the split happens here: anything a job runs goes out on the job pool instead.
class JobRoutedPool extends pg.Pool {
    connect(...args: unknown[]): any {
        return jobScope.getStore() ? Reflect.apply(job_postgres_pool.connect, job_postgres_pool, args) : Reflect.apply(super.connect, this, args);
    }

    query(...args: unknown[]): any {
        return jobScope.getStore() ? Reflect.apply(job_postgres_pool.query, job_postgres_pool, args) : Reflect.apply(super.query, this, args);
    }
}

export const postgres_pool = new JobRoutedPool(postgresPoolConfig(
    parseInt(process.env.POSTGRES_POOL_MAX ?? "10"),
    parseInt(process.env.POSTGRES_POOL_MIN ?? "1"),
));

export const db = drizzle({ client: postgres_pool, schema });

// The pool or a transaction handle - both are PgDatabase. Take this instead of
// `db` in any helper that a caller might need to compose into a larger
// transaction, so its writes commit or roll back with everything around them.
export type DbExecutor = PgDatabase<PgQueryResultHKT, any>;

// A pool emits 'error' for idle clients that drop server-side; log instead of
// letting an unhandled event crash the process.
postgres_pool.on("error", (err) => {
    console.error("Unexpected Postgres pool error", err);
});
