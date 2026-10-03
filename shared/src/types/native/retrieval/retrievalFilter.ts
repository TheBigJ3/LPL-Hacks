import type { z } from "zod";
import type { RetrievalFilterZod } from "../../zod/retrieval/retrievalFilter.js";

export type RetrievalFilter = z.infer<typeof RetrievalFilterZod>;
