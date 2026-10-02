import { readFileSync } from "fs";
import path from "path";
import { rootCertificates, type ConnectionOptions } from "tls";
import requireEnv from "./requireEnv.js";

let cachedCa: string[] | undefined;

export function postgresTlsConfig(): ConnectionOptions {
    // RDS serves either an rds-ca-* cert (only in AWS's bundle) or a public Amazon Root CA cert, and `ca` replaces Node's roots, so trust both.
    cachedCa ??= [...rootCertificates, readFileSync(path.resolve(requireEnv("POSTGRES_CA_CERT_PATH")), "utf8")];

    return {
        rejectUnauthorized: true,
        ca: cachedCa,
    };
}
