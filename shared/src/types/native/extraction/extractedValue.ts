export type ExtractedConfidenceLevel = "high" | "medium" | "low" | "unknown";

export type ExtractedValidationStatus = "valid" | "invalid" | "warning" | "not_validated";

export type ExtractedDataType = "string" | "number" | "currency" | "percentage" | "date" | "checkbox";

export type ExtractedValue = {
  rawValue: string | null;
  value: string | number | boolean | null;
  dataType: ExtractedDataType;
  confidence: number | null;
  confidenceLevel: ExtractedConfidenceLevel;
  requiresReview: boolean;
  validationStatus: ExtractedValidationStatus;
  issues: string[];
};
