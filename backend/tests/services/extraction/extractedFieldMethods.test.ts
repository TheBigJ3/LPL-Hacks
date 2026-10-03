import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AnalyzeDocumentCommand,
  BadDocumentException,
  DocumentTooLargeException,
  LimitExceededException,
  ThrottlingException,
  UnsupportedDocumentException,
} from "@aws-sdk/client-textract";
import { PDFDocument } from "pdf-lib";
import { EXTRACTION_ERRORS } from "../../../types/native/extraction/errors.js";

const { textractSend } = vi.hoisted(() => ({ textractSend: vi.fn() }));

vi.mock("../../../loaders/textractLoader.js", () => ({ textract_client: { send: textractSend } }));

const { extractedFieldAnalyze: extractedFieldAnalyzeDocument } = await import("../../../services/extraction/extractedFieldMethods.js");

const IMAGE = new Uint8Array([0xff, 0xd8, 0xff]);

const extractedFieldAnalyze = async () => (await extractedFieldAnalyzeDocument(IMAGE, "image/jpeg")).analysis;

const pdf = async (pageCount: number) => {
  const document = await PDFDocument.create();
  for (let page = 0; page < pageCount; page++) document.addPage();
  return document.save();
};
const METADATA = { $metadata: {}, message: "textract said no" };

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

const geometry = (left: number, top: number, width: number, height: number) =>
  ({ Geometry: { BoundingBox: { Left: left, Top: top, Width: width, Height: height } } });

const word = (id: string, text: string, confidence?: number) => ({ Id: id, BlockType: "WORD", Text: text, Confidence: confidence });
const key = (id: string, confidence: number, childIds: string[], valueIds: string[] = []) => ({
  Id: id,
  BlockType: "KEY_VALUE_SET",
  EntityTypes: ["KEY"],
  Confidence: confidence,
  Relationships: [
    { Type: "CHILD", Ids: childIds },
    ...(valueIds.length ? [{ Type: "VALUE", Ids: valueIds }] : []),
  ],
});
const value = (id: string, confidence: number, childIds: string[]) => ({
  Id: id,
  BlockType: "KEY_VALUE_SET",
  EntityTypes: ["VALUE"],
  Confidence: confidence,
  Relationships: childIds.length ? [{ Type: "CHILD", Ids: childIds }] : [],
});

const cell = (id: string, row: number, column: number, confidence: number, childIds: string[], header = false) => ({
  Id: id,
  BlockType: "CELL",
  EntityTypes: header ? ["COLUMN_HEADER"] : undefined,
  RowIndex: row,
  ColumnIndex: column,
  Confidence: confidence,
  Relationships: childIds.length ? [{ Type: "CHILD", Ids: childIds }] : [],
});
const table = (id: string, confidence: number, childIds: string[]) => ({
  Id: id,
  BlockType: "TABLE",
  Confidence: confidence,
  Relationships: [{ Type: "CHILD", Ids: childIds }],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractedFieldAnalyze", () => {
  it("sends an image to Textract's sync forms and tables analysis as it is", async () => {
    textractSend.mockResolvedValue({ Blocks: [{ Id: "l1", BlockType: "LINE", Text: "Kept", Confidence: 99 }] });

    const result = await extractedFieldAnalyzeDocument(IMAGE, "image/jpeg");

    const command = textractSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(AnalyzeDocumentCommand);
    expect(command.input).toEqual({ Document: { Bytes: IMAGE }, FeatureTypes: ["FORMS", "TABLES"] });
    expect(result).toMatchObject({ pageCount: 1, analysis: { lines: [{ text: "Kept", page: 1 }] } });
  });

  it("sends a single-page PDF without re-encoding it", async () => {
    const content = await pdf(1);
    textractSend.mockResolvedValue({ Blocks: [] });

    expect(await extractedFieldAnalyzeDocument(content, "application/pdf")).toMatchObject({ pageCount: 1 });
    expect(textractSend.mock.calls[0][0].input.Document.Bytes).toBe(content);
  });

  it("analyzes each page of a multi-page PDF on its own and numbers each block by its page", async () => {
    textractSend
      .mockResolvedValueOnce({ Blocks: [{ Id: "l1", BlockType: "LINE", Text: "Page one", Confidence: 99, Page: 1 }] })
      .mockResolvedValueOnce({ Blocks: [] })
      .mockResolvedValueOnce({ Blocks: [{ Id: "l3", BlockType: "LINE", Text: "Page three", Confidence: 99, Page: 1 }] });

    const result = await extractedFieldAnalyzeDocument(await pdf(3), "application/pdf");

    expect(textractSend).toHaveBeenCalledTimes(3);
    for (const [command] of textractSend.mock.calls) {
      expect((await PDFDocument.load(command.input.Document.Bytes)).getPageCount()).toBe(1);
    }
    expect(result.pageCount).toBe(3);
    expect(result.analysis.lines.map((line) => [line.text, line.page])).toEqual([["Page one", 1], ["Page three", 3]]);
  });

  it("refuses a PDF that can't be opened without calling Textract", async () => {
    await expect(extractedFieldAnalyzeDocument(new Uint8Array([1, 2, 3]), "application/pdf"))
      .rejects.toMatchObject({ _status: EXTRACTION_ERRORS.DOCUMENT_UNREADABLE.STATUS });
    expect(textractSend).not.toHaveBeenCalled();
  });

  it("turns throttling partway through a PDF into the busy AppError", async () => {
    textractSend.mockResolvedValueOnce({ Blocks: [] }).mockRejectedValueOnce(new ThrottlingException(METADATA));

    await expect(extractedFieldAnalyzeDocument(await pdf(2), "application/pdf"))
      .rejects.toMatchObject({ _status: EXTRACTION_ERRORS.EXTRACTION_BUSY.STATUS });
  });

  it("keeps at most 8 pages in Textract at once across every document being analyzed", async () => {
    const pending: ((result: unknown) => void)[] = [];
    textractSend.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));

    const analyses = Promise.all([
      extractedFieldAnalyzeDocument(await pdf(6), "application/pdf"),
      extractedFieldAnalyzeDocument(await pdf(6), "application/pdf"),
    ]);
    await vi.waitFor(() => expect(textractSend).toHaveBeenCalledTimes(8));
    await settle();
    expect(textractSend).toHaveBeenCalledTimes(8);

    textractSend.mockResolvedValue({ Blocks: [] });
    for (const resolve of pending) resolve({ Blocks: [] });

    expect((await analyses).map((result) => result.pageCount)).toEqual([6, 6]);
    expect(textractSend).toHaveBeenCalledTimes(12);
  });

  it("never sends a PDF's queued pages once one of its pages fails", async () => {
    const pending: { resolve: (result: unknown) => void; reject: (err: unknown) => void }[] = [];
    textractSend.mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));

    const analysis = extractedFieldAnalyzeDocument(await pdf(10), "application/pdf");
    await vi.waitFor(() => expect(textractSend).toHaveBeenCalledTimes(8));

    pending[0]!.reject(new BadDocumentException(METADATA));
    await expect(analysis).rejects.toMatchObject({ _status: EXTRACTION_ERRORS.DOCUMENT_UNREADABLE.STATUS });
    for (const { resolve } of pending.slice(1)) resolve({ Blocks: [] });
    await settle();

    expect(textractSend).toHaveBeenCalledTimes(8);
  });

  it.each([
    ["an unreadable document", new BadDocumentException(METADATA), EXTRACTION_ERRORS.DOCUMENT_UNREADABLE],
    ["an unsupported document", new UnsupportedDocumentException(METADATA), EXTRACTION_ERRORS.DOCUMENT_UNREADABLE],
    ["a document that is too large", new DocumentTooLargeException(METADATA), EXTRACTION_ERRORS.DOCUMENT_TOO_LARGE],
    ["throttling", new ThrottlingException(METADATA), EXTRACTION_ERRORS.EXTRACTION_BUSY],
    ["a request limit", new LimitExceededException(METADATA), EXTRACTION_ERRORS.EXTRACTION_BUSY],
  ])("turns %s into the matching AppError", async (_case, textractError, expected) => {
    textractSend.mockRejectedValue(textractError);

    await expect(extractedFieldAnalyzeDocument(IMAGE, "image/jpeg")).rejects.toMatchObject({
      message: expected.MESSAGE,
      _statusCode: expected.HTTP_CODE,
      _status: expected.STATUS,
    });
  });

  it("rethrows any other failure untouched", async () => {
    const credentialsError = new Error("Could not load credentials from any providers");
    textractSend.mockRejectedValue(credentialsError);

    await expect(extractedFieldAnalyzeDocument(IMAGE, "image/jpeg")).rejects.toBe(credentialsError);
  });

  it("pairs each key with its value, reading confidence from the value's words", async () => {
    textractSend.mockResolvedValue({
      Blocks: [
        { ...key("k1", 98, ["w1", "w2"], ["v1"]), ...geometry(0.1, 0.2, 0.15, 0.02) },
        { ...value("v1", 97, ["w3"]), ...geometry(0.3, 0.2, 0.12, 0.02) },
        word("w1", "Employee", 99),
        word("w2", "SSN", 99),
        word("w3", "123-45-6789", 99.4),
      ],
    });

    const { fields } = await extractedFieldAnalyze();

    expect(fields).toEqual([{
      id: "k1",
      label: "Employee SSN",
      page: 1,
      labelBox: { left: 0.1, top: 0.2, width: 0.15, height: 0.02 },
      valueBox: { left: 0.3, top: 0.2, width: 0.12, height: 0.02 },
      rawValue: "123-45-6789",
      value: "123-45-6789",
      dataType: "string",
      confidence: 99.4,
      confidenceLevel: "high",
      requiresReview: false,
      validationStatus: "not_validated",
      issues: [],
    }]);
  });

  it("flags a value whose words read with low confidence", async () => {
    textractSend.mockResolvedValue({
      Blocks: [key("k1", 98, ["w1"], ["v1"]), value("v1", 97, ["w2"]), word("w1", "Employee ID"), word("w2", "183B72", 82)],
    });

    const { fields } = await extractedFieldAnalyze();

    expect(fields[0]).toMatchObject({ value: "183B72", confidence: 82, confidenceLevel: "low", requiresReview: true });
  });

  it("doesn't flag a confidently read value because Textract was unsure of its label pairing", async () => {
    textractSend.mockResolvedValue({
      Blocks: [key("k1", 40, ["w1"], ["v1"]), value("v1", 40, ["w2"]), word("w1", "Plan"), word("w2", "Roth", 99)],
    });

    const { fields } = await extractedFieldAnalyze();

    expect(fields[0]).toMatchObject({ value: "Roth", requiresReview: false, issues: [] });
  });

  it("joins the text of every value block a key points to and spans their boxes", async () => {
    textractSend.mockResolvedValue({
      Blocks: [
        key("k1", 95, ["w1"], ["v1", "v2"]),
        { ...value("v1", 96, ["w2"]), ...geometry(0.1, 0.30, 0.4, 0.02) },
        { ...value("v2", 96, ["w3"]), ...geometry(0.1, 0.33, 0.2, 0.02) },
        word("w1", "Address"),
        word("w2", "100 Main Street", 99),
        word("w3", "Sacramento", 98),
      ],
    });

    const { fields } = await extractedFieldAnalyze();

    expect(fields[0]).toMatchObject({ rawValue: "100 Main Street Sacramento", confidence: 98 });
    expect(fields[0]!.valueBox!.left).toBeCloseTo(0.1);
    expect(fields[0]!.valueBox!.top).toBeCloseTo(0.30);
    expect(fields[0]!.valueBox!.width).toBeCloseTo(0.4);
    expect(fields[0]!.valueBox!.height).toBeCloseTo(0.05);
  });

  it("reads a value holding a single checkbox as a boolean", async () => {
    textractSend.mockResolvedValue({
      Blocks: [
        key("k1", 95, ["w1"], ["v1"]),
        value("v1", 93, ["s1"]),
        word("w1", "Retirement"),
        { Id: "s1", BlockType: "SELECTION_ELEMENT", SelectionStatus: "SELECTED", Confidence: 97 },
      ],
    });

    const { fields } = await extractedFieldAnalyze();

    expect(fields[0]).toMatchObject({ rawValue: "[x]", value: true, dataType: "checkbox", requiresReview: false });
  });

  it("keeps a key with no value region as a missing, unscored field that isn't flagged", async () => {
    textractSend.mockResolvedValue({ Blocks: [key("k1", 97, ["w1"]), word("w1", "Signature")] });

    const { fields } = await extractedFieldAnalyze();

    expect(fields).toEqual([{
      id: "k1",
      label: "Signature",
      page: 1,
      labelBox: null,
      valueBox: null,
      rawValue: null,
      value: null,
      dataType: "string",
      confidence: null,
      confidenceLevel: "unknown",
      requiresReview: false,
      validationStatus: "not_validated",
      issues: [],
    }]);
  });

  it("leaves an empty value region unscored and unflagged, however unsure Textract was of the box", async () => {
    textractSend.mockResolvedValue({ Blocks: [key("k1", 60, ["w1"], ["v1"]), value("v1", 55, []), word("w1", "Notes")] });

    const { fields } = await extractedFieldAnalyze();

    expect(fields[0]).toMatchObject({ rawValue: "", value: null, confidence: null, confidenceLevel: "unknown", requiresReview: false });
  });

  it("drops a key whose text is empty", async () => {
    textractSend.mockResolvedValue({ Blocks: [key("k1", 90, [], ["v1"]), value("v1", 90, [])] });

    const { fields } = await extractedFieldAnalyze();

    expect(fields).toEqual([]);
  });

  it("returns each table's cells with their position, role and normalized value, and the table's page and size", async () => {
    textractSend.mockResolvedValue({
      Blocks: [
        { ...table("t1", 96, ["c1", "c2", "c3", "c4", "w9"]), ...geometry(0.1, 0.5, 0.8, 0.2) },
        { ...cell("c1", 1, 1, 95, ["w1"], true), ...geometry(0.1, 0.5, 0.4, 0.1) },
        cell("c2", 1, 2, 94, ["w2"], true),
        cell("c3", 2, 1, 91, ["w3"]),
        cell("c4", 2, 2, 97, []),
        word("w1", "Account", 99),
        word("w2", "Balance", 99),
        word("w3", "$1,250.00", 98),
        word("w9", "stray"),
      ],
    });

    const { tables } = await extractedFieldAnalyze();

    expect(tables).toEqual([{
      id: "t1",
      kind: "data",
      page: 1,
      box: { left: 0.1, top: 0.5, width: 0.8, height: 0.2 },
      confidence: 96,
      confidenceLevel: "high",
      requiresReview: false,
      rowCount: 2,
      columnCount: 2,
      cells: [
        expect.objectContaining({ id: "c1", box: { left: 0.1, top: 0.5, width: 0.4, height: 0.1 }, row: 1, column: 1, role: "header", fieldId: null, rawValue: "Account", value: "Account" }),
        expect.objectContaining({ id: "c2", box: null, row: 1, column: 2, role: "header", fieldId: null, rawValue: "Balance", value: "Balance" }),
        expect.objectContaining({ row: 2, column: 1, role: "value", fieldId: null, rawValue: "$1,250.00", value: 1250, dataType: "currency", confidence: 98 }),
        expect.objectContaining({ row: 2, column: 2, role: "value", fieldId: null, rawValue: "", value: null, confidence: null, requiresReview: false }),
      ],
    }]);
  });

  it("links a cell holding a form field's value to that field and flags it only on the field", async () => {
    textractSend.mockResolvedValue({
      Blocks: [
        { ...key("k1", 95, ["w1"], ["v1"]), ...geometry(0.1, 0.10, 0.2, 0.02) },
        { ...value("v1", 95, ["w2"]), ...geometry(0.1, 0.14, 0.15, 0.02) },
        word("w1", "Account number", 99),
        word("w2", "TEST-0001", 60),
        { ...table("t1", 96, ["c1", "c2"]), ...geometry(0.05, 0.08, 0.5, 0.1) },
        { ...cell("c1", 1, 1, 95, ["w3"]), ...geometry(0.05, 0.08, 0.5, 0.05) },
        { ...cell("c2", 2, 1, 95, ["w4"]), ...geometry(0.05, 0.13, 0.5, 0.05) },
        word("w3", "Account number", 99),
        word("w4", "TEST-0001", 60),
      ],
    });

    const { fields, tables } = await extractedFieldAnalyze();

    expect(fields[0]).toMatchObject({ id: "k1", requiresReview: true });
    expect(tables[0]!.cells).toEqual([
      expect.objectContaining({ id: "c1", role: "label", fieldId: null, requiresReview: false }),
      expect.objectContaining({ id: "c2", role: "value", fieldId: "k1", requiresReview: false, issues: [] }),
    ]);
    expect(tables[0]!.kind).toBe("form");
  });

  it("treats a cell holding a fragment of a split printed label as a label and never flags it", async () => {
    textractSend.mockResolvedValue({
      Blocks: [
        { ...key("k1", 95, ["w1"], ["v1"]), ...geometry(0.1, 0.10, 0.4, 0.02) },
        { ...value("v1", 95, ["w2"]), ...geometry(0.1, 0.14, 0.1, 0.02) },
        word("w1", "9a Percentage of total dist.", 99),
        word("w2", "100.00 %", 99),
        { ...table("t1", 96, ["c1", "c2"]), ...geometry(0.05, 0.08, 0.6, 0.05) },
        { ...cell("c1", 1, 1, 95, ["w3"]), ...geometry(0.05, 0.08, 0.40, 0.05) },
        { ...cell("c2", 1, 2, 95, ["w4"]), ...geometry(0.45, 0.08, 0.20, 0.05) },
        word("w3", "9a Percentage of total", 99),
        word("w4", "dist.", 40),
      ],
    });

    const { tables } = await extractedFieldAnalyze();

    expect(tables[0]!.cells[1]).toMatchObject({ role: "label", requiresReview: false, issues: [] });
  });

  it("flags a table whose structure was detected with low confidence", async () => {
    textractSend.mockResolvedValue({ Blocks: [table("t1", 60, ["c1"]), cell("c1", 1, 1, 99, ["w1"]), word("w1", "IRA", 99)] });

    const { tables } = await extractedFieldAnalyze();

    expect(tables[0]).toMatchObject({ confidenceLevel: "low", requiresReview: true });
  });

  it("drops a table with no cells", async () => {
    textractSend.mockResolvedValue({ Blocks: [table("t1", 90, ["w1"]), word("w1", "Notes")] });

    const { tables } = await extractedFieldAnalyze();

    expect(tables).toEqual([]);
  });

  it("returns every line of text with its confidence, level, page and box", async () => {
    textractSend.mockResolvedValue({
      Blocks: [{ Id: "l1", BlockType: "LINE", Text: "Form W-2 Wage and Tax Statement", Confidence: 99.1, Page: 1, ...geometry(0.05, 0.02, 0.5, 0.03) }],
    });

    const { lines } = await extractedFieldAnalyze();

    expect(lines).toEqual([{
      text: "Form W-2 Wage and Tax Statement",
      confidence: 99.1,
      confidenceLevel: "high",
      page: 1,
      box: { left: 0.05, top: 0.02, width: 0.5, height: 0.03 },
    }]);
  });
});
