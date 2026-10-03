import type { ExtractedField, ExtractedLine } from "./extractedField.js";
import type { ExtractedTable } from "./extractedTable.js";

export type ExtractedAnalysis = {
  fields: ExtractedField[];
  tables: ExtractedTable[];
  lines: ExtractedLine[];
};
