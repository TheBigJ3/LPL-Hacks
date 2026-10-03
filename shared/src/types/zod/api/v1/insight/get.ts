import { z } from "zod";

export const ParamsZod = z.object({
  clientId: z.uuid(),
  conversationId: z.uuid(),
});
