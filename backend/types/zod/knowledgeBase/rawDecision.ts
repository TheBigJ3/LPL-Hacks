import { z } from "zod";

export const RawDecisionEvidenceZod = z.looseObject({
  id: z.string().min(1),
  text: z.string(),
});

export const RawDecisionAnswerZod = z.looseObject({
  type: z.string().optional(),
  choice: z.string().optional(),
  answer: z.boolean().nullable().optional(),
  status: z.string().optional(),
  evidence: z.array(RawDecisionEvidenceZod).optional(),
});

export const RawDecisionZod = z.looseObject({
  answers: z.record(z.string(), RawDecisionAnswerZod),
});
