import { BedrockAgentCoreControlClient } from "@aws-sdk/client-bedrock-agentcore-control";
import { IAMClient } from "@aws-sdk/client-iam";
import { STSClient } from "@aws-sdk/client-sts";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const AWS_REGION = requireEnv("AWS_REGION");

export const agentcore_control_client = new BedrockAgentCoreControlClient({ region: AWS_REGION });

export const iam_client = new IAMClient({ region: AWS_REGION });

export const sts_client = new STSClient({ region: AWS_REGION });
