import { z } from "zod";

export const ParamsZod = z.object({
  question: z.string().trim().min(1).max(1_000),
  clientId: z.string().min(1),
});
