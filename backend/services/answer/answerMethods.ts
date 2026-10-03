import {
  ConverseCommand,
  ModelNotReadyException,
  ServiceUnavailableException,
  ThrottlingException,
  type Message,
  type Tool,
} from "@aws-sdk/client-bedrock-runtime";
import type { AnswerStatement } from "@lpl-hacks/shared/src/types/native/answer/answerStatement.js";
import type { RetrievalFilter } from "@lpl-hacks/shared/src/types/native/retrieval/retrievalFilter.js";
import { bedrock_runtime_client, BEDROCK_ANSWER_MODEL_ID, BEDROCK_FILTER_MODEL_ID } from "../../loaders/bedrockRuntimeLoader.js";
import { AppError } from "../../modules/AppError.js";
import requireSettings from "../../modules/requireSettings.js";
import { ServerError } from "../../modules/ServerError.js";
import { ANSWER_ERRORS } from "../../types/native/answer/errors.js";
import { retrievalChunkSearch } from "../retrieval/retrievalChunkMethods.js";
import {
  ANSWER_NOT_FOUND_TEXT,
  answerCheckFilters,
  answerCheckFiltersNarrowed,
  answerCheckSources,
  answerCheckStatements,
  answerCheckToolInput,
  type AnswerSource,
} from "./answerChecks.js";

const { MAX_SOURCES } = requireSettings("ANSWER");

export type AnswerResult = {
  answerable: boolean;
  statements: AnswerStatement[];
  filters: RetrievalFilter;
};

const FILTER_TOOL: Tool = {
  toolSpec: {
    name: "set_filters",
    description: "Record which tax year the question is about, if any.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          taxYear: { type: ["integer", "null"], description: "The tax or calendar year the question is about, only if it names or clearly implies one." },
        },
        required: ["taxYear"],
      },
    },
  },
};

const ANSWER_TOOL: Tool = {
  toolSpec: {
    name: "submit_answer",
    description: "Submit the answer to the advisor's question, split into statements with their sources.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          answerable: { type: "boolean", description: "False when the sources do not contain the answer." },
          statements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string", description: "One sentence of the answer. No source ids or brackets in the text." },
                sourceIds: { type: "array", items: { type: "string" }, description: "Ids of the sources that support this sentence, e.g. S1." },
              },
              required: ["text", "sourceIds"],
            },
          },
        },
        required: ["answerable", "statements"],
      },
    },
  },
};

const FILTER_SYSTEM_PROMPT = [
  "You read a financial advisor's question about one client and record the tax year it is about.",
  "Only set taxYear when the question names or clearly implies one; otherwise use null so no relevant document is excluded.",
].join(" ");

const ANSWER_SYSTEM_PROMPT = [
  "You answer a financial advisor's question about one client using only the numbered sources provided, which are quoted excerpts from that client's documents.",
  "Never use outside knowledge. Only state values that appear in the sources; if the question needs a total or difference, compute it only from source values and cite every one of them.",
  "Every sentence must list the sourceIds it relies on.",
  "A source's members and tags come from automated classification; trust the quoted text over them when they disagree.",
  "If the sources do not answer the question, set answerable to false and say briefly what is missing, without stating any numbers.",
  "Be brief: one to four sentences.",
].join(" ");

async function answerConverseTool(modelId: string, system: string, messages: Message[], tool: Tool): Promise<unknown> {
  try {
    const response = await bedrock_runtime_client.send(new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages,
      toolConfig: { tools: [tool], toolChoice: { tool: { name: tool.toolSpec!.name! } } },
      inferenceConfig: { temperature: 0, maxTokens: 1_500 },
    }));
    const toolUse = response.output?.message?.content?.find((block) => block.toolUse)?.toolUse;

    if (!toolUse) {
      throw new ServerError(undefined, `[answer] ${modelId} returned no ${tool.toolSpec!.name} call (stopReason ${response.stopReason})`);
    }

    return toolUse.input;
  } catch (error) {
    if (error instanceof ThrottlingException || error instanceof ServiceUnavailableException || error instanceof ModelNotReadyException) {
      throw new AppError(ANSWER_ERRORS.ANSWER_UNAVAILABLE);
    }
    throw error;
  }
}

function answerSourcesPrompt(question: string, sources: AnswerSource[]): string {
  const blocks = sources.map(({ sourceId, chunk, quote }) => [
    `<source id="${sourceId}" file="${chunk.fileName ?? "unknown"}" docType="${chunk.docType ?? "unknown"}" taxYear="${chunk.taxYear ?? "unknown"}" members="${chunk.familyMembers.join(" ") || "unknown"}">`,
    quote,
    "</source>",
  ].join("\n"));

  return `${blocks.join("\n\n")}\n\nQuestion: ${question}`;
}

export async function answerAsk(question: string, clientId: string): Promise<AnswerResult> {
  const filterInput = await answerConverseTool(BEDROCK_FILTER_MODEL_ID, FILTER_SYSTEM_PROMPT, [{ role: "user", content: [{ text: question }] }], FILTER_TOOL);
  const filters = answerCheckFilters(clientId, filterInput);

  let chunks = await retrievalChunkSearch(question, filters, MAX_SOURCES);

  // The model's filters can over-narrow, so an empty result falls back to the whole household before giving up.
  if (chunks.length === 0 && answerCheckFiltersNarrowed(filters)) {
    chunks = await retrievalChunkSearch(question, { clientId }, MAX_SOURCES);
  }

  if (chunks.length === 0) {
    return { answerable: false, statements: [{ text: ANSWER_NOT_FOUND_TEXT, citations: [] }], filters };
  }

  const sources = answerCheckSources(chunks);
  const answerInput = await answerConverseTool(BEDROCK_ANSWER_MODEL_ID, ANSWER_SYSTEM_PROMPT, [{ role: "user", content: [{ text: answerSourcesPrompt(question, sources) }] }], ANSWER_TOOL);
  const toolInput = answerCheckToolInput(answerInput);

  if (!toolInput) {
    throw new ServerError(undefined, "[answer] submit_answer input did not match its schema");
  }

  return { ...answerCheckStatements(toolInput, sources), filters };
}
