import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/documents/upload.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/documents/upload.js";
import documentExtract from "../../../mq/jobs/documents/documentExtract.js";
import { AppError } from "../../../modules/AppError.js";
import { readUploadRequest } from "../../../modules/readUploadRequest.js";
import { documentCreate } from "../../../services/documents/documentMethods.js";
import { GENERAL_ERRORS } from "../../../types/native/errors.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "POST",
  rateLimitPoints: 10,
};

// Textract's sync API takes 10 MB per call. PDFs are analyzed a page at a time, so only images and TIFFs hit that cap.
const UPLOAD_RULES = {
  mimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/tiff"],
  maxBytes: 50 * 1024 * 1024,
} as const;

const handler: RouteHandler = async (req): Promise<Response> => {
  const params = ParamsZod.safeParse(req.query);
  if (!params.success) throw new AppError(GENERAL_ERRORS.BAD_REQUEST);

  const upload = readUploadRequest(req, UPLOAD_RULES);
  const document = await documentCreate({ fileName: params.data.fileName, ...upload });
  await documentExtract.producer({ documentId: document.id });
  return { success: true, document };
};

export default { config, handler };
