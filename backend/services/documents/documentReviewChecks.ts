import type { DocumentReviewField } from "@lpl-hacks/shared/src/types/native/documents/documentReview.js";
import type { ExtractedAnalysis } from "@lpl-hacks/shared/src/types/native/extraction/extractedAnalysis.js";
import type { ExtractedValue } from "@lpl-hacks/shared/src/types/native/extraction/extractedValue.js";
import { AppError } from "../../modules/AppError.js";
import { DOCUMENT_ERRORS } from "../../types/native/documents/errors.js";

// Mirrors the review screen: a table cell is its own item unless it repeats a form field, and empty form cells aren't shown.
function documentReviewItems(extraction: ExtractedAnalysis): { id: string; value: ExtractedValue }[] {
  return [
    ...extraction.fields.map((field) => ({ id: field.id, value: field })),
    ...extraction.tables.flatMap((table) => table.cells
      .filter((cell) => cell.role === "value" && !cell.fieldId && !(table.kind === "form" && !cell.rawValue))
      .map((cell) => ({ id: cell.id, value: cell }))),
  ];
}

export function documentReviewCheckFields(extraction: ExtractedAnalysis, fields: Record<string, DocumentReviewField>): void {
  const items = documentReviewItems(extraction);
  const known = new Set(items.map((item) => item.id));
  if (Object.keys(fields).some((id) => !known.has(id))) throw new AppError(DOCUMENT_ERRORS.REVIEW_FIELD_UNKNOWN);
  if (items.some((item) => item.value.requiresReview && !(item.id in fields))) throw new AppError(DOCUMENT_ERRORS.REVIEW_INCOMPLETE);
}
