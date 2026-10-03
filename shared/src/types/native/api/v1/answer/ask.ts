import type { z } from "zod";
import type { ParamsZod } from "../../../../zod/api/v1/answer/ask.js";
import type { AnswerStatement } from "../../../answer/answerStatement.js";
import type { RetrievalFilter } from "../../../retrieval/retrievalFilter.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = {
  success: true;
  answerable: boolean;
  statements: AnswerStatement[];
  filters: RetrievalFilter;
};
