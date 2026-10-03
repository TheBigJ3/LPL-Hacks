import { z } from "zod";

export const ParamsZod = z.object({
  fileName: z.string().trim().min(1).max(255),
  clientId: z.uuid().optional(),
});
