import { AsyncLocalStorage } from "async_hooks";

// Set by the workers around every job they run, so code shared with the API can tell it is running on a job's behalf.
export const jobScope = new AsyncLocalStorage<true>();
