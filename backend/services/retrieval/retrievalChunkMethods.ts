import {
  RetrieveCommand,
  ServiceQuotaExceededException,
  ThrottlingException,
  type KnowledgeBaseRetrievalResult,
  type RetrievalFilter as BedrockRetrievalFilter,
} from "@aws-sdk/client-bedrock-agent-runtime";
import type { RetrievalChunk } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalChunk.js";
import type { RetrievalFilter } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalFilter.js";
import { bedrock_agent_runtime_client } from "../../loaders/bedrockAgentRuntimeLoader.js";
import { BEDROCK_KNOWLEDGE_BASE_ID } from "../../loaders/bedrockAgentLoader.js";
import { AppError } from "../../modules/AppError.js";
import { RETRIEVAL_ERRORS } from "../../types/native/retrieval/errors.js";
import { retrievalChunkBuildFilter, retrievalChunkFromResult } from "./retrievalChunkChecks.js";

export async function retrievalChunkSearch(query: string, filters: RetrievalFilter, limit: number): Promise<RetrievalChunk[]> {
  const filter: BedrockRetrievalFilter = retrievalChunkBuildFilter(filters);
  let results: KnowledgeBaseRetrievalResult[];

  try {
    const response = await bedrock_agent_runtime_client.send(new RetrieveCommand({
      knowledgeBaseId: BEDROCK_KNOWLEDGE_BASE_ID,
      retrievalQuery: { text: query },
      retrievalConfiguration: { managedSearchConfiguration: { numberOfResults: limit, filter } },
    }));
    results = response.retrievalResults ?? [];
  } catch (error) {
    if (error instanceof ThrottlingException || error instanceof ServiceQuotaExceededException) {
      throw new AppError(RETRIEVAL_ERRORS.SEARCH_UNAVAILABLE);
    }
    throw error;
  }

  return results.flatMap((result) => {
    const chunk = retrievalChunkFromResult(result);
    return chunk ? [chunk] : [];
  });
}
