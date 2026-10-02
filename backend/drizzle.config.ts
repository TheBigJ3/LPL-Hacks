import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import requireEnv from "./modules/requireEnv.js";
import { postgresTlsConfig } from "./modules/postgresTlsConfig.js";

dotenv.config();

// drizzle-kit loads this file synchronously, so the IAM token is minted beforehand by scripts/drizzleKit.ts.
const dbCredentials = () => ({
  host: requireEnv("POSTGRES_HOST"),
  port: requireEnv("POSTGRES_PORT", "number"),
  database: requireEnv("POSTGRES_DB"),
  user: requireEnv("POSTGRES_USER"),
  password: requireEnv("POSTGRES_IAM_TOKEN"),
  ssl: postgresTlsConfig(),
});

export default defineConfig({
  dialect: "postgresql",
  schema: "./schemas/**/*.ts",
  out: "./drizzle",
  ...(process.env.POSTGRES_IAM_TOKEN ? { dbCredentials: dbCredentials() } : {}),
});
