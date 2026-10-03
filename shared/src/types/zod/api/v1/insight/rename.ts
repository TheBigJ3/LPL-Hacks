import { z } from "zod";

export const ParamsZod = z.object({
  conversationId: z.uuid(),
  title: z.string().trim().min(1).max(120),
});
