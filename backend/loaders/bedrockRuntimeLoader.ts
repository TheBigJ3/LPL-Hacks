import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const AWS_REGION = requireEnv("AWS_REGION");

export const BEDROCK_FILTER_MODEL_ID = requireEnv("BEDROCK_FILTER_MODEL_ID");
export const BEDROCK_ANSWER_MODEL_ID = requireEnv("BEDROCK_ANSWER_MODEL_ID");

export const bedrock_runtime_client = new BedrockRuntimeClient({ region: AWS_REGION });
