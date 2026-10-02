import type { PoolConfig } from "pg";
import requireEnv from "./requireEnv.js";
import { postgresTlsConfig } from "./postgresTlsConfig.js";

export function postgresPoolConfig(max: number, min: number, password: () => Promise<string>): PoolConfig {
    return {
        host: requireEnv("POSTGRES_HOST"),
        port: requireEnv("POSTGRES_PORT", "number"),
        database: requireEnv("POSTGRES_DB"),
        user: requireEnv("POSTGRES_USER"),
        // IAM tokens expire after 15 minutes, so pg asks for a fresh one on every new connection.
        password,
        ssl: postgresTlsConfig(),
        max,
        // Kept open past the idle timeout so a quiet spell doesn't cost the next query a fresh TLS handshake + token.
        min,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
    };
}
