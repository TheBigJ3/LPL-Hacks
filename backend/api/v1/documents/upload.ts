import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/documents/upload.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/documents/upload.js";
import documentExtract from "../../../mq/jobs/documents/documentExtract.js";
import { AppError } from "../../../modules/AppError.js";
import { readUploadRequest } from "../../../modules/readUploadRequest.js";
import { DOCUMENT_UPLOAD_RULES, documentCreate } from "../../../services/documents/documentMethods.js";
import { GENERAL_ERRORS } from "../../../types/native/errors.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "POST",
  rateLimitPoints: 10,
};

const handler: RouteHandler = async (req): Promise<Response> => {
  const params = ParamsZod.safeParse(req.query);
  if (!params.success) throw new AppError(GENERAL_ERRORS.BAD_REQUEST);

  const upload = readUploadRequest(req, DOCUMENT_UPLOAD_RULES);
  const document = await documentCreate({ ...params.data, ...upload });
  await documentExtract.producer({ documentId: document.id });
  return { success: true, document };
};

export default { config, handler };
