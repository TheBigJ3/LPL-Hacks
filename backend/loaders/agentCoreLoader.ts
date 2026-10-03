import { BedrockAgentCoreClient } from "@aws-sdk/client-bedrock-agentcore";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const AWS_REGION = requireEnv("AWS_REGION");

export const INSIGHT_HARNESS_ARN = requireEnv("INSIGHT_HARNESS_ARN");

export const agentcore_client = new BedrockAgentCoreClient({ region: AWS_REGION });
