import { BedrockAgentClient } from "@aws-sdk/client-bedrock-agent";
import { BedrockAgentCoreControlClient } from "@aws-sdk/client-bedrock-agentcore-control";
import requireEnv from "../modules/requireEnv.js";

const AWS_REGION = requireEnv("AWS_REGION");

export const bedrock_agent_lookup_client = new BedrockAgentClient({ region: AWS_REGION });

export const agentcore_control_lookup_client = new BedrockAgentCoreControlClient({ region: AWS_REGION });
