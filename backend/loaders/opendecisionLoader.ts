import { SageMakerRuntimeClient } from "@aws-sdk/client-sagemaker-runtime";
import dotenv from "dotenv";
import requireEnv from "../modules/requireEnv.js";

dotenv.config();

const AWS_REGION = requireEnv("AWS_REGION");

export const OPENDECISION_ENDPOINT_NAME = requireEnv("OPENDECISION_ENDPOINT_NAME");

// The service runs as a SageMaker endpoint, so IAM (sagemaker:InvokeEndpoint) is the auth and no service token is sent.
export const opendecision_client = new SageMakerRuntimeClient({ region: AWS_REGION, retryMode: "adaptive" });
