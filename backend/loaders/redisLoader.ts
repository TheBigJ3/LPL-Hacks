import { Redis as IORedis } from "ioredis";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const REDIS_HOST : string = requireEnv("REDIS_HOST")
const REDIS_PORT : number = parseInt(requireEnv("REDIS_PORT"))
const REDIS_PASSWORD : string = requireEnv("REDIS_PASSWORD")

export const redis_client = new IORedis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null,
})

// Producers can share `redis_client`, but every BullMQ Worker/QueueEvents needs
// its OWN connection because it parks on a blocking command. Mint a fresh one.
export function createRedisConnection() {
    return new IORedis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD,
        maxRetriesPerRequest: null,
    })
}
