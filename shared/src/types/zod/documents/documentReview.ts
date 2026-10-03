import { z } from "zod";

export const DocumentReviewFieldZod = z.object({
  value: z.union([z.string().max(10_000), z.boolean()]),
  corrected: z.boolean(),
});
