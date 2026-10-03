import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const AWS_REGION = requireEnv("AWS_REGION");

// Uploaded documents. Kept in AWS_REGION so the extraction worker's download stays in-region.
export const S3_DOCUMENTS_BUCKET = requireEnv("S3_DOCUMENTS_BUCKET");

export const s3_client = new S3Client({ region: AWS_REGION });
