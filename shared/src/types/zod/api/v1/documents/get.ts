import { z } from "zod";

export const ParamsZod = z.object({
  documentId: z.uuid(),
});
