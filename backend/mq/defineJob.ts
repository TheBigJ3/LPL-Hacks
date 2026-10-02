import type { Job } from "bullmq";
import type { z } from "zod";
import type { JobDefinition, JobSchedule, QueueDefinition } from "../types/native/mq/index.js";

type JobSettings<PayloadZod extends z.ZodType> = {
  name: string;
  queue: QueueDefinition;
  payload: PayloadZod;
  jobId: (payload: z.infer<PayloadZod>) => string;
  delay?: (payload: z.infer<PayloadZod>) => number;
  handler: (payload: z.infer<PayloadZod>, job: Job) => Promise<string | void>;
};

type ScheduleSettings = {
  name: string;
  queue: QueueDefinition;
  schedule: JobSchedule;
  handler: (job: Job) => Promise<void>;
};

export function defineJob<PayloadZod extends z.ZodType>(settings: JobSettings<PayloadZod>): JobDefinition<z.infer<PayloadZod>> {
  const { name, queue, payload, jobId, delay, handler } = settings;

  return {
    name,
    queue,
    handler: async (job) => handler(payload.parse(job.data), job),
    producer: async (data) => {
      await queue.queue().add(name, data, {
        ...queue.jobOptions,
        jobId: jobId(data),
        ...(delay ? { delay: Math.max(delay(data), 0) } : {}),
      });
    },
  };
}

// Keyed on a fixed scheduler id, so every boot of every instance upserts the one schedule instead of stacking copies.
export function defineSchedule(settings: ScheduleSettings): JobDefinition<void> {
  const { name, queue, schedule, handler } = settings;

  return {
    name,
    queue,
    schedule,
    handler: (job) => handler(job),
    producer: async () => {
      await queue.queue().upsertJobScheduler(schedule.id, { every: schedule.every }, { name, data: {}, opts: queue.jobOptions });
    },
  };
}
