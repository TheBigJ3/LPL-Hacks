import type { ExtractedBox } from "./extractedBox.js";
import type { ExtractedConfidenceLevel, ExtractedValue } from "./extractedValue.js";

export type ExtractedField = ExtractedValue & {
  id: string;
  label: string;
  page: number;
  labelBox: ExtractedBox | null;
  valueBox: ExtractedBox | null;
};

export type ExtractedLine = {
  text: string;
  confidence: number;
  confidenceLevel: ExtractedConfidenceLevel;
  page: number;
  box: ExtractedBox | null;
};
