import type { PoolConfig } from "pg";
import requireEnv from "./requireEnv.js";

export function postgresPoolConfig(max: number, min: number): PoolConfig {
    return {
        host: requireEnv("POSTGRES_HOST"),
        port: requireEnv("POSTGRES_PORT", "number"),
        database: requireEnv("POSTGRES_DB"),
        user: requireEnv("POSTGRES_USER"),
        password: requireEnv("POSTGRES_PASSWORD"),

        // Always negotiate TLS so credentials never cross the wire in plaintext.
        //   POSTGRES_SSL_VERIFY=true -> verify the server cert. If POSTGRES_CA_CERT
        //     is set, verify against that (private CA); otherwise verify against
        //     Node's built-in roots (Neon uses Let's Encrypt, which is trusted).
        //   unset/false -> TLS on, cert not verified (fine for local dev).
        ssl: {
            rejectUnauthorized: process.env.POSTGRES_SSL_VERIFY === "true",
            ca: process.env.POSTGRES_CA_CERT,
        },

        max,
        // Kept open past the idle timeout so a quiet spell doesn't cost the next query a fresh ~400ms TLS handshake.
        min,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
    };
}
