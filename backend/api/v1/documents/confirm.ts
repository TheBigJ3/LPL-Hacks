import { ParamsZod } from "@lpl-hacks/shared/src/types/zod/api/v1/documents/confirm.js";
import type { Response } from "@lpl-hacks/shared/src/types/native/api/v1/documents/confirm.js";
import documentTag from "../../../mq/jobs/documents/documentTag.js";
import { AppError } from "../../../modules/AppError.js";
import { documentConfirm } from "../../../services/documents/documentMethods.js";
import { GENERAL_ERRORS } from "../../../types/native/errors.js";
import type { RouteConfig } from "../../../types/native/api/RouteConfig.js";
import type { RouteHandler } from "../../../types/native/api/RouteHandler.js";

const config: RouteConfig = {
  method: "POST",
  rateLimitPoints: 5,
};

const handler: RouteHandler = async (req): Promise<Response> => {
  const params = ParamsZod.safeParse(req.body);
  if (!params.success) throw new AppError(GENERAL_ERRORS.BAD_REQUEST);

  const { documentId, fields } = params.data;
  const { document, reviewedAt } = await documentConfirm(documentId, fields);
  const corrected = Object.values(fields).filter((field) => field.corrected).length;
  console.info(`[audit] ${req.user.userId} confirmed document ${documentId}: ${Object.keys(fields).length} fields verified, ${corrected} corrected`);
  await documentTag.producer({ documentId, reviewedAt });
  return { success: true, document };
};

export default { config, handler };
