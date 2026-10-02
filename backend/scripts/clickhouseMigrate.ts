import "dotenv/config";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { clickhouse_client } from "../loaders/clickhouseLoader.js";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../clickhouse/migrations");

async function clickhouseMigrationGetApplied(): Promise<Set<string>> {
  await clickhouse_client.command({
    query: "CREATE TABLE IF NOT EXISTS _migrations (name String, applied_at DateTime64(3) DEFAULT now64(3)) ENGINE = MergeTree ORDER BY name",
  });

  const result = await clickhouse_client.query({ query: "SELECT name FROM _migrations", format: "JSONEachRow" });
  const rows = await result.json<{ name: string }>();
  return new Set(rows.map((row) => row.name));
}

async function clickhouseMigrate() {
  const applied = await clickhouseMigrationGetApplied();
  const pending = (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith(".sql") && !applied.has(file))
    .sort();

  for (const file of pending) {
    const statement = (await readFile(path.join(MIGRATIONS_DIR, file), "utf8")).trim().replace(/;$/, "");
    await clickhouse_client.command({ query: statement });
    await clickhouse_client.insert({
      table: "_migrations",
      values: [{ name: file }],
      format: "JSONEachRow",
      clickhouse_settings: { async_insert: 0 },
    });
    console.log(`[clickhouseMigrate] Applied ${file}`);
  }

  console.log(`[clickhouseMigrate] Done. Applied ${pending.length}, already applied ${applied.size}.`);
}

clickhouseMigrate()
  .catch((err) => {
    console.error("[clickhouseMigrate] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await clickhouse_client.close();
  });
