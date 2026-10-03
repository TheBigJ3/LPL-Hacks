import { z } from "zod";

export const ParamsZod = z.object({
  noteId: z.uuid(),
});
