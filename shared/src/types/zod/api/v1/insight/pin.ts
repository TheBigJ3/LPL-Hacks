import { z } from "zod";

export const ParamsZod = z.object({
  conversationId: z.uuid(),
  pinned: z.boolean(),
});
