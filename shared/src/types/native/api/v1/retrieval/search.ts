import type { z } from "zod";
import type { ParamsZod } from "../../../../zod/api/v1/retrieval/search.js";
import type { RetrievalChunk } from "../../../retrieval/retrievalChunk.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = {
  success: true;
  chunks: RetrievalChunk[];
};
