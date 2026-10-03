import { z } from "zod";
import { OpendecisionAnswerZod, OpendecisionDocumentDecisionZod, OpendecisionEvidenceZod } from "../../zod/opendecision/documentDecision.js";

export type OpendecisionEvidence = z.infer<typeof OpendecisionEvidenceZod>;

export type OpendecisionAnswer = z.infer<typeof OpendecisionAnswerZod>;

export type OpendecisionDocumentDecision = z.infer<typeof OpendecisionDocumentDecisionZod>;

export type OpendecisionMember = {
  first_name: string;
  middle_name?: string;
  last_name: string;
  person_id: string;
};
