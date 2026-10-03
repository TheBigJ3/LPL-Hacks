import { z } from "zod";

export const RetrievalFilterZod = z.object({
  clientId: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1).optional(),
  taxYear: z.number().int().optional(),
  familyMember: z.string().min(1).optional(),
});
