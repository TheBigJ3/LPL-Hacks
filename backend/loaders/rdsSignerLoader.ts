import { Signer } from "@aws-sdk/rds-signer";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const AWS_REGION = requireEnv("AWS_REGION");
const POSTGRES_HOST = requireEnv("POSTGRES_HOST");
const POSTGRES_PORT = requireEnv("POSTGRES_PORT", "number");
const POSTGRES_USER = requireEnv("POSTGRES_USER");

// Credentials come from the SDK's default chain: AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, then AWS_PROFILE / ~/.aws, then an instance role.
export const rds_signer = new Signer({
    region: AWS_REGION,
    hostname: POSTGRES_HOST,
    port: POSTGRES_PORT,
    username: POSTGRES_USER,
});
