import { TextractClient } from "@aws-sdk/client-textract";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const AWS_REGION = requireEnv("AWS_REGION");

// Credentials come from the SDK's default chain: AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, then AWS_PROFILE / ~/.aws, then an instance role.
export const textract_client = new TextractClient({ region: AWS_REGION });
