import {
  AnalyzeDocumentCommand,
  BadDocumentException,
  DocumentTooLargeException,
  ProvisionedThroughputExceededException,
  ThrottlingException,
  UnsupportedDocumentException,
  type Block,
  type BoundingBox,
} from "@aws-sdk/client-textract";
import type { ExtractedBox } from "@lpl-hacks/shared/src/types/native/extraction/extractedBox.js";
import type { ExtractedField, ExtractedLine } from "@lpl-hacks/shared/src/types/native/extraction/extractedField.js";
import type { ExtractedTable, ExtractedTableCell, ExtractedTableCellRole } from "@lpl-hacks/shared/src/types/native/extraction/extractedTable.js";
import { textract_client } from "../../loaders/textractLoader.js";
import { AppError } from "../../modules/AppError.js";
import { EXTRACTION_ERRORS } from "../../types/native/extraction/errors.js";
import type { ExtractedFieldToken } from "../../types/native/extraction/extractedFieldToken.js";
import {
  extractedFieldCheckConfidenceLevel,
  extractedFieldCheckValue,
  extractedFieldFormatRawText,
  extractedFieldMeasureOverlap,
} from "./extractedFieldChecks.js";

const CELL_FIELD_OVERLAP = 0.3;
const CELL_LABEL_OVERLAP = 0.25;

type ExtractedFieldAnalysis = {
  fields: ExtractedField[];
  tables: ExtractedTable[];
  lines: ExtractedLine[];
};

export async function extractedFieldAnalyze(document: Uint8Array): Promise<ExtractedFieldAnalysis> {
  let blocks: Block[];
  try {
    const result = await textract_client.send(new AnalyzeDocumentCommand({
      Document: { Bytes: document },
      FeatureTypes: ["FORMS", "TABLES"],
    }));
    blocks = result.Blocks ?? [];
  } catch (err) {
    throw extractedFieldTranslateError(err);
  }

  const blocksById = new Map(blocks.map((block) => [block.Id!, block]));

  const fields = blocks
    .filter((block) => block.BlockType === "KEY_VALUE_SET" && block.EntityTypes?.includes("KEY"))
    .map((keyBlock): ExtractedField => {
      const label = extractedFieldFormatRawText(extractedFieldTokens(extractedFieldRelated(keyBlock, "CHILD", blocksById)));
      const valueBlocks = extractedFieldRelated(keyBlock, "VALUE", blocksById);
      const valueChildren = valueBlocks.flatMap((valueBlock) => extractedFieldRelated(valueBlock, "CHILD", blocksById));
      return {
        id: keyBlock.Id!,
        label,
        page: keyBlock.Page ?? 1,
        labelBox: extractedFieldBox([keyBlock]),
        valueBox: extractedFieldBox(valueBlocks),
        ...extractedFieldCheckValue({
          tokens: valueBlocks.length > 0 ? extractedFieldTokens(valueChildren) : null,
          confidence: extractedFieldConfidence(valueChildren),
          label,
        }),
      };
    })
    .filter((field) => field.label !== "");

  const tables = blocks
    .filter((block) => block.BlockType === "TABLE")
    .map((tableBlock): ExtractedTable => {
      const page = tableBlock.Page ?? 1;
      const pageFields = fields.filter((field) => field.page === page);
      const cells = extractedFieldRelated(tableBlock, "CHILD", blocksById)
        .filter((child) => child.BlockType === "CELL")
        .map((cellBlock): ExtractedTableCell => {
          const cellChildren = extractedFieldRelated(cellBlock, "CHILD", blocksById);
          const box = extractedFieldBox([cellBlock]);
          const fieldId = box ? extractedFieldMatchCell(box, pageFields) : null;
          const tokens = extractedFieldTokens(cellChildren);
          const text = extractedFieldFormatRawText(tokens);
          const role: ExtractedTableCellRole = fieldId ? "value"
            : cellBlock.EntityTypes?.includes("COLUMN_HEADER") ? "header"
              : box && extractedFieldCheckLabelCell(box, text, pageFields) ? "label"
                : "value";
          const checked = extractedFieldCheckValue({ tokens, confidence: extractedFieldConfidence(cellChildren) });
          return {
            id: cellBlock.Id!,
            box,
            row: cellBlock.RowIndex ?? 1,
            column: cellBlock.ColumnIndex ?? 1,
            role,
            fieldId,
            // Printed labels aren't data, and a cell repeating a form field is reviewed once, on that field.
            ...(role === "value" && !fieldId ? checked : { ...checked, requiresReview: false, issues: [] }),
          };
        });
      const confidenceLevel = extractedFieldCheckConfidenceLevel(tableBlock.Confidence ?? 0);
      const formCells = cells.filter((cell) => cell.role === "label" || cell.fieldId).length;
      return {
        id: tableBlock.Id!,
        kind: formCells * 2 >= cells.length ? "form" : "data",
        page,
        box: extractedFieldBox([tableBlock]),
        confidence: tableBlock.Confidence ?? 0,
        confidenceLevel,
        requiresReview: confidenceLevel === "low",
        rowCount: Math.max(0, ...cells.map((cell) => cell.row)),
        columnCount: Math.max(0, ...cells.map((cell) => cell.column)),
        cells,
      };
    })
    .filter((table) => table.cells.length > 0);

  const lines = blocks
    .filter((block) => block.BlockType === "LINE")
    .map((block): ExtractedLine => ({
      text: block.Text ?? "",
      confidence: block.Confidence ?? 0,
      confidenceLevel: extractedFieldCheckConfidenceLevel(block.Confidence ?? 0),
      page: block.Page ?? 1,
      box: extractedFieldBox([block]),
    }));

  return { fields, tables, lines };
}

function extractedFieldRelated(block: Block, type: "VALUE" | "CHILD", blocksById: Map<string, Block>): Block[] {
  return (block.Relationships ?? [])
    .filter((relationship) => relationship.Type === type)
    .flatMap((relationship) => relationship.Ids ?? [])
    .map((id) => blocksById.get(id))
    .filter((related): related is Block => related !== undefined);
}

function extractedFieldTokens(children: Block[]): ExtractedFieldToken[] {
  return children.flatMap((child): ExtractedFieldToken[] => {
    if (child.BlockType === "SELECTION_ELEMENT") return [{ kind: "selection", selected: child.SelectionStatus === "SELECTED" }];
    return child.Text ? [{ kind: "word", text: child.Text }] : [];
  });
}

function extractedFieldBox(blocks: Block[]): ExtractedBox | null {
  const boxes = blocks.flatMap((block) => block.Geometry?.BoundingBox ? [block.Geometry.BoundingBox] : []);
  if (boxes.length === 0) return null;
  if (boxes.length === 1) {
    const [box] = boxes as [BoundingBox];
    return { left: box.Left ?? 0, top: box.Top ?? 0, width: box.Width ?? 0, height: box.Height ?? 0 };
  }
  const left = Math.min(...boxes.map((box) => box.Left ?? 0));
  const top = Math.min(...boxes.map((box) => box.Top ?? 0));
  const right = Math.max(...boxes.map((box) => (box.Left ?? 0) + (box.Width ?? 0)));
  const bottom = Math.max(...boxes.map((box) => (box.Top ?? 0) + (box.Height ?? 0)));
  return { left, top, width: right - left, height: bottom - top };
}

// Only the text's own word confidences describe an OCR reading; an empty region has nothing to score.
function extractedFieldConfidence(children: Block[]): number | null {
  const confidences = children.flatMap((block) => block.Confidence === undefined ? [] : [block.Confidence]);
  return confidences.length > 0 ? Math.min(...confidences) : null;
}

// Textract splits a printed label across cells, so a cell is a label if it sits mostly on one or holds a piece of its text.
function extractedFieldCheckLabelCell(box: ExtractedBox, text: string, fields: ExtractedField[]): boolean {
  return fields.some((field) => {
    if (!field.labelBox) return false;
    const overlap = extractedFieldMeasureOverlap(box, field.labelBox);
    return overlap >= CELL_LABEL_OVERLAP || (overlap > 0 && text.trim() !== "" && field.label.includes(text.trim()));
  });
}

function extractedFieldMatchCell(box: ExtractedBox, fields: ExtractedField[]): string | null {
  let best: { id: string; overlap: number } | null = null;
  for (const field of fields) {
    if (!field.valueBox) continue;
    const overlap = extractedFieldMeasureOverlap(box, field.valueBox);
    if (overlap >= CELL_FIELD_OVERLAP && overlap > (best?.overlap ?? 0)) best = { id: field.id, overlap };
  }
  return best?.id ?? null;
}

function extractedFieldTranslateError(err: unknown): unknown {
  if (err instanceof BadDocumentException || err instanceof UnsupportedDocumentException) {
    return new AppError(EXTRACTION_ERRORS.DOCUMENT_UNREADABLE);
  }
  if (err instanceof DocumentTooLargeException) {
    return new AppError(EXTRACTION_ERRORS.DOCUMENT_TOO_LARGE);
  }
  if (err instanceof ThrottlingException || err instanceof ProvisionedThroughputExceededException) {
    return new AppError(EXTRACTION_ERRORS.EXTRACTION_BUSY);
  }
  return err;
}
