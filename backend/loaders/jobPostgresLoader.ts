import pg from "pg";
import dotenv from "dotenv";
import { postgresPoolConfig } from "../modules/postgresPoolConfig.js";

dotenv.config();

// Jobs get their own connections, so a backed-up queue can never take the ones buyers' requests are waiting on.
export const job_postgres_pool = new pg.Pool(postgresPoolConfig(
    parseInt(process.env.POSTGRES_JOB_POOL_MAX ?? "10"),
    parseInt(process.env.POSTGRES_JOB_POOL_MIN ?? "1"),
));

job_postgres_pool.on("error", (err) => {
    console.error("Unexpected Postgres job pool error", err);
});
