import { z } from "zod";

export const OpendecisionEvidenceZod = z.looseObject({
  id: z.string(),
  text: z.string(),
});

export const OpendecisionAnswerZod = z.looseObject({
  type: z.string().optional(),
  choice: z.string().optional(),
  answer: z.boolean().nullable().optional(),
  status: z.string().optional(),
  evidence: z.array(OpendecisionEvidenceZod).optional(),
});

export const OpendecisionDocumentDecisionZod = z.looseObject({
  docType: OpendecisionAnswerZod,
  tags: z.record(z.string(), OpendecisionAnswerZod),
  members: z.record(z.string(), OpendecisionAnswerZod),
});
