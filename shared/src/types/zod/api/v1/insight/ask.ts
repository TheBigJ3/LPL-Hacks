import { z } from "zod";

export const ParamsZod = z.object({
  clientId: z.uuid(),
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(4_000),
});
