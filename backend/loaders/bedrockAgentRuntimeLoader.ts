import { BedrockAgentRuntimeClient } from "@aws-sdk/client-bedrock-agent-runtime";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const AWS_REGION = requireEnv("AWS_REGION");

export const bedrock_agent_runtime_client = new BedrockAgentRuntimeClient({ region: AWS_REGION });
