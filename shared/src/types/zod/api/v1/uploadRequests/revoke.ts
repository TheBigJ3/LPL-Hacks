import { z } from "zod";

export const ParamsZod = z.object({
  uploadRequestId: z.uuid(),
});
