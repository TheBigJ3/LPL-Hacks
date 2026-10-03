import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const AWS_REGION = requireEnv("AWS_REGION");

export const s3_client = new S3Client({ region: AWS_REGION });
