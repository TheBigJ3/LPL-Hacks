import { z } from "zod";
import { uploadRequestExpiryDays } from "../../../../native/uploadRequests/uploadRequest.js";

export const ParamsZod = z.object({
  clientId: z.uuid(),
  note: z.string().trim().max(500).optional(),
  expiresInDays: z.literal(uploadRequestExpiryDays),
});
