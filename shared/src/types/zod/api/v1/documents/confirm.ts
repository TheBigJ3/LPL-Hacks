import { z } from "zod";
import { DocumentReviewFieldZod } from "../../../documents/documentReview.js";

export const ParamsZod = z.object({
  documentId: z.uuid(),
  fields: z.record(z.string().min(1).max(200), DocumentReviewFieldZod),
});
