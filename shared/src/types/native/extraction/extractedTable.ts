import type { ExtractedBox } from "./extractedBox.js";
import type { ExtractedConfidenceLevel, ExtractedValue } from "./extractedValue.js";

export type ExtractedTableCellRole = "header" | "label" | "value";

export type ExtractedTableCell = ExtractedValue & {
  id: string;
  box: ExtractedBox | null;
  row: number;
  column: number;
  role: ExtractedTableCellRole;
  fieldId: string | null;
};

export type ExtractedTable = {
  id: string;
  kind: "data" | "form";
  page: number;
  box: ExtractedBox | null;
  confidence: number;
  confidenceLevel: ExtractedConfidenceLevel;
  requiresReview: boolean;
  rowCount: number;
  columnCount: number;
  cells: ExtractedTableCell[];
};
