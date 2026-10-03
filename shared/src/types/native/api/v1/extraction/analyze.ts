import type { ExtractedField, ExtractedLine } from "../../../extraction/extractedField.js";
import type { ExtractedTable } from "../../../extraction/extractedTable.js";

export type Response = {
  success: true;
  fields: ExtractedField[];
  tables: ExtractedTable[];
  lines: ExtractedLine[];
};
