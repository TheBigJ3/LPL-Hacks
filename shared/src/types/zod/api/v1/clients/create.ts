import { z } from "zod";
import { CLIENT_HOUSEHOLD_MAX_MEMBERS, ClientNameZod, ClientPersonNameZod } from "../../../clients/client.js";

export const ParamsZod = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("individual"),
    name: ClientPersonNameZod,
  }),
  z.object({
    kind: z.literal("household"),
    name: ClientNameZod,
    members: z.array(z.object({ name: ClientPersonNameZod })).min(1).max(CLIENT_HOUSEHOLD_MAX_MEMBERS),
  }),
]);
