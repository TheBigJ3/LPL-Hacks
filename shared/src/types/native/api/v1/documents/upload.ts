import { z } from "zod";
import { ParamsZod } from "../../../../zod/api/v1/documents/upload.js";
import type { Document } from "../../../documents/document.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = {
  success: true;
  document: Document;
};
