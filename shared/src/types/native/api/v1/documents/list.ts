import { z } from "zod";
import { ParamsZod } from "../../../../zod/api/v1/documents/list.js";
import type { DocumentListItem } from "../../../documents/document.js";

export type Params = z.infer<typeof ParamsZod>;

export type Response = {
  success: true;
  documents: DocumentListItem[];
};
