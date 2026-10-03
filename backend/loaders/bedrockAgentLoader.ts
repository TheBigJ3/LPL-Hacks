import { BedrockAgentClient } from "@aws-sdk/client-bedrock-agent";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const AWS_REGION = requireEnv("AWS_REGION");

export const BEDROCK_KNOWLEDGE_BASE_ID = requireEnv("BEDROCK_KNOWLEDGE_BASE_ID");
export const BEDROCK_DATA_SOURCE_ID = requireEnv("BEDROCK_DATA_SOURCE_ID");
export const BEDROCK_KNOWLEDGE_BASE_BUCKET = requireEnv("BEDROCK_KNOWLEDGE_BASE_BUCKET");

export const bedrock_agent_client = new BedrockAgentClient({ region: AWS_REGION });
