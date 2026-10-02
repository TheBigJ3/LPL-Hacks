import { createClient } from "@clickhouse/client";
import requireEnv from "../modules/requireEnv.js";

const CH_URL: string = requireEnv("CH_URL");
const CH_USER: string = requireEnv("CH_USER");
const CH_PASSWORD: string = requireEnv("CH_PASSWORD");

export const clickhouse_client = createClient({
    url: CH_URL,
    username: CH_USER,
    password: CH_PASSWORD,
    clickhouse_settings: {
        // ClickHouse degrades under many small inserts; the server buffers them into batches, and each insert resolves once its batch is written.
        async_insert: 1,
        wait_for_async_insert: 1,
    },
});
