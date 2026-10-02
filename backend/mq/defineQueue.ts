import { Queue } from "bullmq";
import { redis_client } from "../loaders/redisLoader.js";
import type { QueueDefinition, QueueSettings } from "../types/native/mq/index.js";

export function defineQueue(settings: QueueSettings): QueueDefinition {
  let queue: Queue | null = null;

  return {
    ...settings,
    queue: () => (queue ??= new Queue(settings.name, { connection: redis_client })),
  };
}
