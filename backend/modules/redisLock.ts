import { redis_client } from "../loaders/redisLoader.js"
import { GENERAL_ERRORS } from "../types/native/errors.js"
import { AppError } from "./AppError.js"

const LOCK_TTL_SECONDS = 10

const lockKey = (uniqueKey : string) => `redis_lock:${uniqueKey}`

export const redisLock = async (uniqueKey : string) => {
  const token = crypto.randomUUID()
  const successful = await redis_client.set(lockKey(uniqueKey), token, "EX", LOCK_TTL_SECONDS, "NX")
  if (!successful) {
    throw new AppError(GENERAL_ERRORS.LOCK_ACQUISITION_FAILED)
  }
  return token
}

export const redisUnlock = async (uniqueKey : string, token : string) => {
  const successful = await redis_client.eval(
    `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
        return 0
    end
    `,
    1,
    lockKey(uniqueKey),
    token
  )
  if (!successful) {
    throw new AppError(GENERAL_ERRORS.LOCK_RELEASE_FAILED)
  }
}