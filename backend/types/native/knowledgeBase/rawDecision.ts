import type { z } from "zod";
import type { RawDecisionZod } from "../../zod/knowledgeBase/rawDecision.js";

export type RawDecision = z.infer<typeof RawDecisionZod>;
