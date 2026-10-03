import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import dotenv from "dotenv";
import { envFileFill } from "../modules/envFileFill.js";

const ENV_PATH = ".env.development";
const EXAMPLE_PATH = ".env.example";
const LOOKED_UP_KEYS = ["BEDROCK_KNOWLEDGE_BASE_ID", "BEDROCK_DATA_SOURCE_ID", "BEDROCK_KNOWLEDGE_BASE_BUCKET", "INSIGHT_HARNESS_ARN"];
const DEFAULTED_KEYS = ["BEDROCK_FILTER_MODEL_ID", "BEDROCK_ANSWER_MODEL_ID"];

type DevEnvValues = Record<string, string>;

function devEnvBucketName(configuration: { s3Configuration?: { bucketArn?: string }; managedKnowledgeBaseConnectorConfiguration?: { connectorParameters?: unknown } } | undefined): string | null {
  const arn = configuration?.s3Configuration?.bucketArn;
  if (arn) return arn.split(":::")[1] ?? null;

  const raw = configuration?.managedKnowledgeBaseConnectorConfiguration?.connectorParameters;
  const parameters = (typeof raw === "string" ? JSON.parse(raw) : raw) as { connectionConfiguration?: { bucketName?: string } } | undefined;
  return parameters?.connectionConfiguration?.bucketName ?? null;
}

async function devEnvLookUp(wanted: Set<string>): Promise<DevEnvValues> {
  const { ListKnowledgeBasesCommand, ListDataSourcesCommand, GetDataSourceCommand } = await import("@aws-sdk/client-bedrock-agent");
  const { ListHarnessesCommand } = await import("@aws-sdk/client-bedrock-agentcore-control");
  const { bedrock_agent_lookup_client, agentcore_control_lookup_client } = await import("../loaders/awsLookupLoader.js");
  const { default: requireSettings } = await import("../modules/requireSettings.js");
  const values: DevEnvValues = {};

  if (wanted.has("BEDROCK_KNOWLEDGE_BASE_ID") || wanted.has("BEDROCK_DATA_SOURCE_ID") || wanted.has("BEDROCK_KNOWLEDGE_BASE_BUCKET")) {
    const name = requireSettings("KNOWLEDGE_BASE").DEV_NAME;
    const { knowledgeBaseSummaries } = await bedrock_agent_lookup_client.send(new ListKnowledgeBasesCommand({ maxResults: 100 }));
    const knowledgeBaseId = knowledgeBaseSummaries?.find((summary) => summary.name === name)?.knowledgeBaseId;
    if (!knowledgeBaseId) throw new Error(`no knowledge base named "${name}" in this account and region`);
    values.BEDROCK_KNOWLEDGE_BASE_ID = knowledgeBaseId;

    const { dataSourceSummaries } = await bedrock_agent_lookup_client.send(new ListDataSourcesCommand({ knowledgeBaseId, maxResults: 100 }));
    const dataSourceId = (dataSourceSummaries?.find((summary) => summary.status === "AVAILABLE") ?? dataSourceSummaries?.[0])?.dataSourceId;
    if (!dataSourceId) throw new Error(`knowledge base ${knowledgeBaseId} has no data source`);
    values.BEDROCK_DATA_SOURCE_ID = dataSourceId;

    const { dataSource } = await bedrock_agent_lookup_client.send(new GetDataSourceCommand({ knowledgeBaseId, dataSourceId }));
    const bucket = devEnvBucketName(dataSource?.dataSourceConfiguration);
    if (!bucket) throw new Error(`couldn't find the S3 bucket behind data source ${dataSourceId}`);
    values.BEDROCK_KNOWLEDGE_BASE_BUCKET = bucket;
  }

  if (wanted.has("INSIGHT_HARNESS_ARN")) {
    const name = requireSettings("INSIGHT").HARNESS_NAME;
    const { harnesses } = await agentcore_control_lookup_client.send(new ListHarnessesCommand({}));
    const arn = harnesses?.find((harness) => harness.harnessName === name)?.arn;
    if (!arn) throw new Error(`no harness named "${name}" yet; create it with npm run insight:harness --workspace backend`);
    values.INSIGHT_HARNESS_ARN = arn;
  }

  return Object.fromEntries(Object.entries(values).filter(([key]) => wanted.has(key)));
}

if (!existsSync(ENV_PATH)) {
  copyFileSync(EXAMPLE_PATH, ENV_PATH);
  console.log(`[devEnv] Created backend/${ENV_PATH} from ${EXAMPLE_PATH}; fill in its database and Redis settings.`);
}

const current = dotenv.parse(readFileSync(ENV_PATH));
const example = dotenv.parse(readFileSync(EXAMPLE_PATH));
const isMissing = (key: string) => !current[key]?.trim();
const wanted = new Set(LOOKED_UP_KEYS.filter(isMissing));
const values: DevEnvValues = Object.fromEntries(DEFAULTED_KEYS.filter((key) => isMissing(key) && example[key]).map((key) => [key, example[key]!]));

if (wanted.size > 0) {
  dotenv.config({ path: ENV_PATH, override: true, quiet: true });
  try {
    Object.assign(values, await devEnvLookUp(wanted));
  } catch (error) {
    const profile = current.AWS_PROFILE?.trim();
    console.warn(`[devEnv] Couldn't look up ${[...wanted].join(", ")}: ${(error as Error).message}`);
    console.warn(`[devEnv] Sign in to AWS (${profile ? `aws sso login --profile ${profile}` : "set AWS_PROFILE in backend/.env.development, or run aws configure"}), then run npm run dev again.`);
  }
}

if (Object.keys(values).length > 0) {
  const result = envFileFill(readFileSync(ENV_PATH, "utf8"), values, "Filled in by npm run dev from AWS (scripts/devEnv.ts).");
  writeFileSync(ENV_PATH, result.content);
  console.log(`[devEnv] Filled in ${result.filled.join(", ")} in backend/${ENV_PATH}.`);
}
