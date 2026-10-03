import { z } from "zod";
import { ParamsZod } from "../../../../zod/api/v1/documents/content.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = Blob;
