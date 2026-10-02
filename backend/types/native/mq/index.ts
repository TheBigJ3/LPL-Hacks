import type { Job, JobsOptions, Queue } from "bullmq";

// A returned string is the job's outcome, stored by BullMQ as the job's return value.
export type JobHandler = (job: Job) => Promise<string | void>;

export type QueueSettings = {
  name: string;
  concurrency: number;
  jobOptions: JobsOptions;
};

export type QueueDefinition = QueueSettings & {
  queue: () => Queue;
};

export type JobSchedule = {
  id: string;
  every: number;
};

export type JobDefinition<Payload> = {
  name: string;
  queue: QueueDefinition;
  schedule?: JobSchedule;
  handler: JobHandler;
  producer: (payload: Payload) => Promise<void>;
};
