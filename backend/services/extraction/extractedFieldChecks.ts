import type { ExtractedBox } from "@lpl-hacks/shared/src/types/native/extraction/extractedBox.js";
import type {
  ExtractedConfidenceLevel,
  ExtractedDataType,
  ExtractedValue,
} from "@lpl-hacks/shared/src/types/native/extraction/extractedValue.js";
import WebsiteSettings from "../../config/Settings.js";
import type { ExtractedFieldToken } from "../../types/native/extraction/extractedFieldToken.js";

type ExtractedFieldRead = Pick<ExtractedValue, "value" | "dataType" | "validationStatus" | "issues">;

const { CONFIDENCE_HIGH, CONFIDENCE_MEDIUM } = WebsiteSettings.EXTRACTION;

const PLACEHOLDER = /^[\s$%/\\()_.\-–—]+$/;
const NUMBER = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
const CURRENCY = /^\$\s*(.*\d.*)$/;
const PERCENTAGE = /^(.*\d.*?)\s*%$/;
const DATE_NUMERIC = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_SHORT_YEAR = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2}$/;
const CONFUSABLE_LETTERS = "OoIlBSZ";
const CRITICAL_LABEL = /\b(ssn|social security|tin|ein|taxpayer|tax id|identification|account|routing|date|birth|dob|name|signature|amount|payment|distribution|wages|compensation|withheld|withholding|total|balance|medical|policy)\b/;

export function extractedFieldFormatRawText(tokens: ExtractedFieldToken[]): string {
  return tokens
    .map((token) => token.kind === "selection" ? (token.selected ? "[x]" : "[ ]") : token.text)
    .join(" ");
}

export function extractedFieldCheckConfidenceLevel(confidence: number | null): ExtractedConfidenceLevel {
  if (confidence === null) return "unknown";
  if (confidence >= CONFIDENCE_HIGH) return "high";
  if (confidence >= CONFIDENCE_MEDIUM) return "medium";
  return "low";
}

export function extractedFieldCheckValue({ tokens, confidence, label = null }: {
  tokens: ExtractedFieldToken[] | null;
  confidence: number | null;
  label?: string | null;
}): ExtractedValue {
  const confidenceLevel = extractedFieldCheckConfidenceLevel(confidence);
  const read = tokens === null ? extractedFieldReadEmpty("string") : extractedFieldReadTokens(tokens, confidenceLevel);
  const issues = [...read.issues];

  if (confidenceLevel === "low") {
    issues.push(`OCR confidence is low (${confidence!.toFixed(1)}%).`);
  } else if (confidenceLevel === "medium" && read.value !== null && read.dataType !== "checkbox" && extractedFieldCheckCritical(label, read.dataType)) {
    issues.push(`Critical value read below ${CONFIDENCE_HIGH}% OCR confidence.`);
  }

  return {
    rawValue: tokens === null ? null : extractedFieldFormatRawText(tokens),
    ...read,
    confidence,
    confidenceLevel,
    requiresReview: issues.length > 0,
    issues,
  };
}

export function extractedFieldMeasureOverlap(container: ExtractedBox, box: ExtractedBox): number {
  const width = Math.min(container.left + container.width, box.left + box.width) - Math.max(container.left, box.left);
  const height = Math.min(container.top + container.height, box.top + box.height) - Math.max(container.top, box.top);
  const area = box.width * box.height;
  return width <= 0 || height <= 0 || area <= 0 ? 0 : (width * height) / area;
}

function extractedFieldCheckCritical(label: string | null, dataType: ExtractedDataType): boolean {
  if (dataType === "currency" || dataType === "date") return true;
  return label !== null && CRITICAL_LABEL.test(label.toLowerCase().replace(/[^a-z0-9\s]/g, " "));
}

function extractedFieldCheckConfusable(token: string): boolean {
  const letters = token.match(/[A-Za-z]/g) ?? [];
  const digits = token.match(/\d/g) ?? [];
  return digits.length >= 4 && letters.length > 0 && letters.length <= 2
    && letters.every((letter) => CONFUSABLE_LETTERS.includes(letter));
}

function extractedFieldReadEmpty(dataType: ExtractedDataType): ExtractedFieldRead {
  return { value: null, dataType, validationStatus: "not_validated", issues: [] };
}

function extractedFieldReadTokens(tokens: ExtractedFieldToken[], confidenceLevel: ExtractedConfidenceLevel): ExtractedFieldRead {
  const selections = tokens.filter((token) => token.kind === "selection");
  const text = tokens
    .flatMap((token) => token.kind === "word" ? [token.text] : [])
    .join(" ")
    .trim();

  if (selections.length === 0) return extractedFieldReadText(text);
  if (selections.length === 1 && text === "") {
    if (confidenceLevel === "low") {
      return { value: null, dataType: "checkbox", validationStatus: "not_validated", issues: ["Checkbox state is unclear."] };
    }
    return { value: selections[0]!.selected, dataType: "checkbox", validationStatus: "valid", issues: [] };
  }
  if (text === "") {
    return {
      value: extractedFieldFormatRawText(tokens),
      dataType: "string",
      validationStatus: "warning",
      issues: ["Several checkboxes with no option labels, so which option is marked is unclear."],
    };
  }
  return { value: extractedFieldFormatRawText(tokens), dataType: "string", validationStatus: "not_validated", issues: [] };
}

function extractedFieldReadText(text: string): ExtractedFieldRead {
  if (text === "") return extractedFieldReadEmpty("string");
  if (PLACEHOLDER.test(text)) {
    return extractedFieldReadEmpty(text.includes("$") ? "currency" : text.includes("%") ? "percentage" : "string");
  }

  const currency = CURRENCY.exec(text);
  if (currency) return extractedFieldReadNumber(text, currency[1]!, "currency");
  const percentage = PERCENTAGE.exec(text);
  if (percentage) return extractedFieldReadNumber(text, percentage[1]!, "percentage");

  const numericDate = DATE_NUMERIC.exec(text);
  if (numericDate) {
    const [, first, second, year] = numericDate.map(Number) as [number, number, number, number];
    return extractedFieldReadDate(text, [[year, first, second], [year, second, first]]);
  }
  const isoDate = DATE_ISO.exec(text);
  if (isoDate) {
    const [, year, month, day] = isoDate.map(Number) as [number, number, number, number];
    return extractedFieldReadDate(text, [[year, month, day]]);
  }
  if (DATE_SHORT_YEAR.test(text)) {
    return { value: text, dataType: "date", validationStatus: "warning", issues: ["Two-digit year, so the century and month/day order aren't established."] };
  }

  // Bare digit runs stay strings: they're as likely to be IDs, ZIPs or account numbers as quantities.
  if (/[.,]/.test(text) && NUMBER.test(text) && !/^-?0\d/.test(text)) {
    return { value: Number(text.replace(/,/g, "")), dataType: "number", validationStatus: "valid", issues: [] };
  }

  if (text.split(/\s+/).some(extractedFieldCheckConfusable)) {
    return {
      value: text,
      dataType: "string",
      validationStatus: "warning",
      issues: ["Contains letters where digits are expected; check for OCR misreads such as B for 8 or O for 0."],
    };
  }
  return { value: text, dataType: "string", validationStatus: "not_validated", issues: [] };
}

function extractedFieldReadNumber(text: string, digits: string, dataType: "currency" | "percentage"): ExtractedFieldRead {
  const trimmed = digits.trim();
  if (NUMBER.test(trimmed)) {
    return { value: Number(trimmed.replace(/,/g, "")), dataType, validationStatus: "valid", issues: [] };
  }
  return {
    value: text,
    dataType,
    validationStatus: "invalid",
    issues: [`Doesn't read as a ${dataType === "currency" ? "currency amount" : "percentage"}; it has unexpected characters.`],
  };
}

function extractedFieldReadDate(text: string, readings: [number, number, number][]): ExtractedFieldRead {
  const dates = new Set(readings
    .filter(([year, month, day]) => month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate())
    .map(([year, month, day]) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`));

  if (dates.size === 0) return { value: text, dataType: "date", validationStatus: "invalid", issues: ["Date does not exist."] };
  if (dates.size > 1) {
    return { value: text, dataType: "date", validationStatus: "warning", issues: ["Month and day order isn't established by the document."] };
  }
  return { value: [...dates][0]!, dataType: "date", validationStatus: "valid", issues: [] };
}
