import {
  CreateHarnessCommand,
  CreateMemoryCommand,
  GetHarnessCommand,
  GetMemoryCommand,
  ListHarnessesCommand,
  ListMemoriesCommand,
  UpdateHarnessCommand,
  type HarnessTool,
} from "@aws-sdk/client-bedrock-agentcore-control";
import { CreateRoleCommand, GetRoleCommand, NoSuchEntityException, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { agentcore_control_client, iam_client, sts_client } from "../loaders/agentCoreControlLoader.js";
import requireEnv from "../modules/requireEnv.js";
import requireSettings from "../modules/requireSettings.js";
import {
  INSIGHT_ALLOWED_TOOLS,
  INSIGHT_SEARCH_TOOL_DESCRIPTION,
  INSIGHT_SEARCH_TOOL_NAME,
  INSIGHT_SEARCH_TOOL_SCHEMA,
  INSIGHT_SYSTEM_PROMPT,
} from "../services/insight/insightAnswerChecks.js";

const AWS_REGION = requireEnv("AWS_REGION");
const HARNESS_NAME = requireSettings("INSIGHT").HARNESS_NAME;
const ROLE_NAME = "LplInsightHarnessRole";
const MEMORY_NAME = "lpl_insight_memory";
const MODEL_ID = process.env.INSIGHT_MODEL_ID ?? "global.anthropic.claude-sonnet-4-6";

const SEARCH_TOOL: HarnessTool = {
  type: "inline_function",
  name: INSIGHT_SEARCH_TOOL_NAME,
  config: { inlineFunction: { description: INSIGHT_SEARCH_TOOL_DESCRIPTION, inputSchema: INSIGHT_SEARCH_TOOL_SCHEMA } },
};

function trustPolicy(account: string) {
  return {
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: { Service: "bedrock-agentcore.amazonaws.com" },
      Action: "sts:AssumeRole",
      Condition: {
        StringEquals: { "aws:SourceAccount": account },
        ArnLike: { "aws:SourceArn": `arn:aws:bedrock-agentcore:${AWS_REGION}:${account}:*` },
      },
    }],
  };
}

// Only what this harness uses: the model, its container image, its own logs and identity, and its managed memory.
function executionPolicy(account: string) {
  const agentcore = `arn:aws:bedrock-agentcore:${AWS_REGION}:${account}`;
  return {
    Version: "2012-10-17",
    Statement: [
      { Sid: "ModelInvocation", Effect: "Allow", Action: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], Resource: ["arn:aws:bedrock:*::foundation-model/anthropic.*", `arn:aws:bedrock:*:${account}:inference-profile/*`] },
      { Sid: "ImagePullToken", Effect: "Allow", Action: ["ecr-public:GetAuthorizationToken", "sts:GetServiceBearerToken", "ecr:GetAuthorizationToken"], Resource: "*" },
      { Sid: "ImagePull", Effect: "Allow", Action: ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"], Resource: `arn:aws:ecr:${AWS_REGION}:*:repository/harness-*` },
      { Sid: "Tracing", Effect: "Allow", Action: ["xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets"], Resource: "*" },
      { Sid: "LogGroups", Effect: "Allow", Action: ["logs:CreateLogGroup", "logs:DescribeLogStreams"], Resource: `arn:aws:logs:${AWS_REGION}:${account}:log-group:/aws/bedrock-agentcore/runtimes/*` },
      { Sid: "LogGroupsDescribe", Effect: "Allow", Action: ["logs:DescribeLogGroups"], Resource: `arn:aws:logs:${AWS_REGION}:${account}:log-group:*` },
      { Sid: "LogStreams", Effect: "Allow", Action: ["logs:CreateLogStream", "logs:PutLogEvents"], Resource: `arn:aws:logs:${AWS_REGION}:${account}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*` },
      { Sid: "LogResourcePolicy", Effect: "Allow", Action: ["logs:PutResourcePolicy"], Resource: `arn:aws:logs:${AWS_REGION}:${account}:log-group:/aws/bedrock-agentcore/runtimes/harness_${HARNESS_NAME}-*` },
      { Sid: "Metrics", Effect: "Allow", Action: "cloudwatch:PutMetricData", Resource: "*", Condition: { StringEquals: { "cloudwatch:namespace": "bedrock-agentcore" } } },
      { Sid: "WorkloadIdentity", Effect: "Allow", Action: ["bedrock-agentcore:GetWorkloadAccessToken", "bedrock-agentcore:GetWorkloadAccessTokenForJWT"], Resource: [`${agentcore}:workload-identity-directory/default`, `${agentcore}:workload-identity-directory/default/workload-identity/harness_${HARNESS_NAME}-*`] },
      { Sid: "Memory", Effect: "Allow", Action: ["bedrock-agentcore:CreateEvent", "bedrock-agentcore:DeleteEvent", "bedrock-agentcore:GetEvent", "bedrock-agentcore:ListEvents", "bedrock-agentcore:RetrieveMemoryRecords"], Resource: `${agentcore}:memory/${MEMORY_NAME}-*` },
    ],
  };
}

async function setupRole(account: string): Promise<string> {
  let arn: string;
  try {
    arn = (await iam_client.send(new GetRoleCommand({ RoleName: ROLE_NAME }))).Role!.Arn!;
    console.log(`Role ${ROLE_NAME} exists`);
  } catch (err) {
    if (!(err instanceof NoSuchEntityException)) throw err;
    arn = (await iam_client.send(new CreateRoleCommand({
      RoleName: ROLE_NAME,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy(account)),
      Description: "Execution role for the Insight chat harness",
    }))).Role!.Arn!;
    console.log(`Created role ${ROLE_NAME}`);
  }

  await iam_client.send(new PutRolePolicyCommand({ RoleName: ROLE_NAME, PolicyName: "LplInsightHarnessExecution", PolicyDocument: JSON.stringify(executionPolicy(account)) }));
  return arn;
}

const HARNESS_SETTINGS = {
  model: { bedrockModelConfig: { modelId: MODEL_ID, maxTokens: 2_048, temperature: 0.2, apiFormat: "converse_stream" as const } },
  systemPrompt: [{ text: INSIGHT_SYSTEM_PROMPT }],
  tools: [SEARCH_TOOL],
  allowedTools: INSIGHT_ALLOWED_TOOLS,
  maxIterations: 12,
  maxTokens: 16_000,
  timeoutSeconds: 180,
  truncation: { strategy: "sliding_window" as const, config: { slidingWindow: { messagesCount: 60 } } },
};

// No long-term strategies: the harness keeps each conversation's turns, and never feeds remembered facts back in uncited.
async function setupMemory(): Promise<string> {
  const existing = (await agentcore_control_client.send(new ListMemoriesCommand({}))).memories?.find((memory) => memory.id?.startsWith(`${MEMORY_NAME}-`));
  const id = existing?.id ?? (await agentcore_control_client.send(new CreateMemoryCommand({
    name: MEMORY_NAME,
    description: "Short-term conversation history for the Insight chat harness",
    eventExpiryDuration: 30,
  }))).memory!.id!;
  console.log(`${existing ? "Using" : "Created"} memory ${id}`);

  for (let attempt = 0; attempt < 60; attempt++) {
    const { memory } = await agentcore_control_client.send(new GetMemoryCommand({ memoryId: id }));
    if (memory?.status === "ACTIVE") return memory.arn!;
    if (memory?.status === "FAILED") throw new Error(`Memory ${id} failed: ${memory.failureReason ?? "no reason given"}`);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Memory ${id} not ACTIVE after 5 minutes`);
}

async function setupHarness(roleArn: string, memoryArn: string): Promise<string> {
  const existing = (await agentcore_control_client.send(new ListHarnessesCommand({}))).harnesses?.find((harness) => harness.harnessName === HARNESS_NAME);

  if (existing) {
    await agentcore_control_client.send(new UpdateHarnessCommand({
      harnessId: existing.harnessId!,
      executionRoleArn: roleArn,
      memory: { optionalValue: { agentCoreMemoryConfiguration: { arn: memoryArn } } },
      ...HARNESS_SETTINGS,
    }));
    console.log(`Updated harness ${HARNESS_NAME}`);
    return existing.harnessId!;
  }

  const created = await agentcore_control_client.send(new CreateHarnessCommand({
    harnessName: HARNESS_NAME,
    executionRoleArn: roleArn,
    memory: { agentCoreMemoryConfiguration: { arn: memoryArn } },
    ...HARNESS_SETTINGS,
  }));
  console.log(`Created harness ${HARNESS_NAME}`);
  return created.harness!.harnessId!;
}

async function waitReady(harnessId: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const { harness } = await agentcore_control_client.send(new GetHarnessCommand({ harnessId }));
    if (harness?.status === "READY") return harness.arn!;
    if (harness?.status?.endsWith("FAILED")) throw new Error(`Harness ${harnessId} is ${harness.status}: ${harness.failureReason ?? "no reason given"}`);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Harness ${harnessId} not READY after 5 minutes`);
}

try {
  const account = (await sts_client.send(new GetCallerIdentityCommand({}))).Account!;
  const roleArn = await setupRole(account);
  const memoryArn = await setupMemory();
  const harnessId = await setupHarness(roleArn, memoryArn);
  const arn = await waitReady(harnessId);
  console.log(`Harness READY. Set this in backend/.env.development:\nINSIGHT_HARNESS_ARN=${arn}`);
} catch (error) {
  console.error(`Failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
