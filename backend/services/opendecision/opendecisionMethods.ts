import {
  InternalDependencyException,
  InvokeEndpointCommand,
  ModelError,
  ModelNotReadyException,
  ServiceUnavailable,
} from "@aws-sdk/client-sagemaker-runtime";
import { OPENDECISION_ENDPOINT_NAME, opendecision_client } from "../../loaders/opendecisionLoader.js";
import { AppError } from "../../modules/AppError.js";
import { ServerError } from "../../modules/ServerError.js";
import type { OpendecisionOperation } from "../../types/native/opendecision/index.js";
import { OPENDECISION_ERRORS } from "../../types/native/opendecision/errors.js";

export async function opendecisionInvoke<T = unknown>(operation: OpendecisionOperation, body: unknown = {}): Promise<T> {
  let result;
  try {
    result = await opendecision_client.send(new InvokeEndpointCommand({
      EndpointName: OPENDECISION_ENDPOINT_NAME,
      CustomAttributes: `operation=${operation}`,
      ContentType: "application/json",
      Accept: "application/json",
      Body: new TextEncoder().encode(JSON.stringify(body)),
    }));
  } catch (err) {
    throw opendecisionTranslateError(operation, err);
  }
  return JSON.parse(new TextDecoder().decode(result.Body)) as T;
}

function opendecisionTranslateError(operation: OpendecisionOperation, err: unknown): unknown {
  if (err instanceof ModelNotReadyException || err instanceof ServiceUnavailable || err instanceof InternalDependencyException) {
    return new AppError(OPENDECISION_ERRORS.ANALYSIS_BUSY);
  }
  // A non-200 from the container arrives as ModelError carrying its original status and body.
  if (err instanceof ModelError) {
    if (err.OriginalStatusCode === 413) return new AppError(OPENDECISION_ERRORS.REQUEST_TOO_LARGE);
    return new ServerError(undefined, `[opendecision] ${operation} returned ${err.OriginalStatusCode}: ${err.OriginalMessage}`);
  }
  return err;
}
