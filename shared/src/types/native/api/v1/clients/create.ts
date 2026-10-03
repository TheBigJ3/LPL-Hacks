import { z } from "zod";
import { ParamsZod } from "../../../../zod/api/v1/clients/create.js";
import type { Client } from "../../../clients/client.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = {
  success: true;
  client: Client;
};
