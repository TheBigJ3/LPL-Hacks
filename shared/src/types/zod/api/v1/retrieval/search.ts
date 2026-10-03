import { z } from "zod";
import { RetrievalFilterZod } from "../../../retrieval/retrievalFilter.js";

export const ParamsZod = z.object({
  query: z.string().trim().min(1).max(1_000),
  filters: RetrievalFilterZod,
  limit: z.number().int().positive().max(25).default(8),
});
