import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { Worker } from "bullmq";
import { createRedisConnection } from "../loaders/redisLoader.js";
import { ServerError } from "../modules/ServerError.js";
import { moduleFiles } from "../modules/moduleFiles.js";
import { jobScope } from "../modules/jobScope.js";
import type { JobDefinition, JobHandler, QueueDefinition } from "../types/native/mq/index.js";

const JOBS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "jobs");

type QueueJobs = {
  queue: QueueDefinition;
  handlers: Map<string, JobHandler>;
};

export async function startWorkers(): Promise<Worker[]> {
  const jobs = await Promise.all(moduleFiles(JOBS_DIR).map(async (file) => {
    const module: { default: JobDefinition<unknown> } = await import(pathToFileURL(file).href);
    return module.default;
  }));

  return startWorkersFor(jobs);
}

export async function startWorkersFor(jobs: JobDefinition<unknown>[]): Promise<Worker[]> {
  const workers = [...workersGroupByQueue(jobs).values()].map(workersStart);

  await Promise.all(jobs.filter((job) => job.schedule).map((job) => job.producer(undefined)));

  for (const job of jobs) console.log(`Loaded job: ${job.queue.name}/${job.name}${job.schedule ? " (scheduled)" : ""}`);

  return workers;
}

function workersGroupByQueue(jobs: JobDefinition<unknown>[]): Map<string, QueueJobs> {
  const queues = new Map<string, QueueJobs>();

  for (const job of jobs) {
    const entry = queues.get(job.queue.name) ?? { queue: job.queue, handlers: new Map<string, JobHandler>() };

    if (entry.queue !== job.queue) {
      throw new ServerError(undefined, `[workers] Two queue files are both named ${job.queue.name}`);
    }

    if ([...queues.values()].some((queued) => queued.handlers.has(job.name))) {
      throw new ServerError(undefined, `[workers] Two job files are both named ${job.name}`);
    }

    entry.handlers.set(job.name, job.handler);
    queues.set(job.queue.name, entry);
  }

  return queues;
}

function workersStart({ queue, handlers }: QueueJobs): Worker {
  const worker = new Worker(
    queue.name,
    async (job) => {
      const handler = handlers.get(job.name);

      if (!handler) {
        throw new ServerError(undefined, `[workers] No handler registered for ${queue.name}/${job.name}`);
      }

      return jobScope.run(true, () => handler(job));
    },
    { connection: createRedisConnection(), concurrency: queue.concurrency },
  );

  worker.on("failed", (job, error) => {
    console.error(`[mq] ${queue.name}/${job?.name ?? "unknown"} failed`, error);
  });

  return worker;
}
