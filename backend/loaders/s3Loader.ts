import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const AWS_REGION = requireEnv("AWS_REGION");

// Textract's async API reads documents from S3 itself, so this bucket must be in AWS_REGION.
export const S3_DOCUMENTS_BUCKET = requireEnv("S3_DOCUMENTS_BUCKET");

export const s3_client = new S3Client({ region: AWS_REGION });
