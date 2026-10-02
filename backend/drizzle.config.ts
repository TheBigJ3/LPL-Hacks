import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import requireEnv from "./modules/requireEnv.js";

dotenv.config();

export default defineConfig({
  dialect: "postgresql",
  // Glob every schema module so new tables are picked up automatically.
  // Recursive: tables live in subdirectories too (Schemas/games/**/*).
  schema: "./schemas/**/*.ts",
  out: "./drizzle",
  dbCredentials: {
    host: requireEnv("POSTGRES_HOST"),
    port: parseInt(requireEnv("POSTGRES_PORT")),
    database: requireEnv("POSTGRES_DB"),
    user: requireEnv("POSTGRES_USER"),
    password: requireEnv("POSTGRES_PASSWORD"),
    ssl: {
      rejectUnauthorized: process.env.POSTGRES_SSL_VERIFY === "true",
      ca: process.env.POSTGRES_CA_CERT,
    },
  },
});
