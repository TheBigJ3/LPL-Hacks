import { buffer } from "node:stream/consumers";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/extraction/analyze.js";
import { readUploadRequest } from "../../../modules/readUploadRequest.js";
import { extractedFieldAnalyze } from "../../../services/extraction/extractedFieldMethods.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "POST",
  rateLimitPoints: 10,
};

// Textract's synchronous API caps a document at 10 MB and reads only single-page PDFs.
const UPLOAD_RULES = {
  mimeTypes: ["application/pdf", "image/png", "image/jpeg", "image/tiff"],
  maxBytes: 10 * 1024 * 1024,
} as const;

const handler: RouteHandler = async (req): Promise<Response> => {
  const upload = readUploadRequest(req, UPLOAD_RULES);
  const document = await buffer(upload.body);
  const { fields, tables, lines } = await extractedFieldAnalyze(document);
  return { success: true, fields, tables, lines };
};

export default { config, handler };
