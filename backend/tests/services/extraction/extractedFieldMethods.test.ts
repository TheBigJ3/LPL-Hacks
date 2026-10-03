import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BadDocumentException,
  DocumentTooLargeException,
  GetDocumentAnalysisCommand,
  LimitExceededException,
  StartDocumentAnalysisCommand,
  ThrottlingException,
  UnsupportedDocumentException,
} from "@aws-sdk/client-textract";
import { EXTRACTION_ERRORS } from "../../../types/native/extraction/errors.js";

const { textractSend } = vi.hoisted(() => ({ textractSend: vi.fn() }));

vi.mock("../../../loaders/textractLoader.js", () => ({ textract_client: { send: textractSend } }));

const { extractedFieldAnalyzeCollect, extractedFieldAnalyzeStart } = await import("../../../services/extraction/extractedFieldMethods.js");

const DOCUMENT_ID = "2f1c8f0e-5d1a-4c47-9a3e-8f0a2b6c9d11";
const LOCATION = { bucket: "documents-bucket", key: `documents/${DOCUMENT_ID}` };

const extractedFieldAnalyze = async () => {
  const result = await extractedFieldAnalyzeCollect("job-1");
  if (result.status !== "succeeded") throw new Error(`Expected a finished analysis, got ${result.status}`);
  return result.analysis;
};
const METADATA = { $metadata: {}, message: "textract said no" };

const geometry = (left: number, top: number, width: number, height: number) =>
  ({ Geometry: { BoundingBox: { Left: left, Top: top, Width: width, Height: height } } });

const word = (id: string, text: string, confidence?: number) => ({ Id: id, BlockType: "WORD", Text: text, Confidence: confidence });
const key = (id: string, confidence: number, childIds: string[], valueIds: string[] = [], page = 1) => ({
  Id: id,
  BlockType: "KEY_VALUE_SET",
  EntityTypes: ["KEY"],
  Confidence: confidence,
  Page: page,
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
const table = (id: string, confidence: number, childIds: string[], page = 1) => ({
  Id: id,
  BlockType: "TABLE",
  Confidence: confidence,
  Page: page,
  Relationships: [{ Type: "CHILD", Ids: childIds }],
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractedFieldAnalyzeStart", () => {
  it("starts an async forms and tables analysis on the stored object, keyed to the document", async () => {
    textractSend.mockResolvedValue({ JobId: "job-1" });

    expect(await extractedFieldAnalyzeStart(DOCUMENT_ID, LOCATION)).toBe("job-1");

    const command = textractSend.mock.calls[0][0];
    expect(command).toBeInstanceOf(StartDocumentAnalysisCommand);
    expect(command.input).toEqual({
      DocumentLocation: { S3Object: { Bucket: "documents-bucket", Name: `documents/${DOCUMENT_ID}` } },
      FeatureTypes: ["FORMS", "TABLES"],
      ClientRequestToken: DOCUMENT_ID,
    });
  });

  it.each([
    ["an unreadable document", new BadDocumentException(METADATA), EXTRACTION_ERRORS.DOCUMENT_UNREADABLE],
    ["an unsupported document", new UnsupportedDocumentException(METADATA), EXTRACTION_ERRORS.DOCUMENT_UNREADABLE],
    ["a document that is too large", new DocumentTooLargeException(METADATA), EXTRACTION_ERRORS.DOCUMENT_TOO_LARGE],
    ["throttling", new ThrottlingException(METADATA), EXTRACTION_ERRORS.EXTRACTION_BUSY],
    ["too many concurrent jobs", new LimitExceededException(METADATA), EXTRACTION_ERRORS.EXTRACTION_BUSY],
  ])("turns %s into the matching AppError", async (_case, textractError, expected) => {
    textractSend.mockRejectedValue(textractError);

    await expect(extractedFieldAnalyzeStart(DOCUMENT_ID, LOCATION)).rejects.toMatchObject({
      message: expected.MESSAGE,
      _statusCode: expected.HTTP_CODE,
      _status: expected.STATUS,
    });
  });

  it("rethrows any other failure untouched", async () => {
    const credentialsError = new Error("Could not load credentials from any providers");
    textractSend.mockRejectedValue(credentialsError);

    await expect(extractedFieldAnalyzeStart(DOCUMENT_ID, LOCATION)).rejects.toBe(credentialsError);
  });
});

describe("extractedFieldAnalyzeCollect", () => {
  it("reports a job Textract is still working on as pending", async () => {
    textractSend.mockResolvedValue({ JobStatus: "IN_PROGRESS" });

    expect(await extractedFieldAnalyzeCollect("job-1")).toEqual({ status: "pending" });
  });

  it("reports a job Textract gave up on as failed with the unreadable message", async () => {
    textractSend.mockResolvedValue({ JobStatus: "FAILED", StatusMessage: "Request has unsupported document format" });

    expect(await extractedFieldAnalyzeCollect("job-1")).toEqual({ status: "failed", message: EXTRACTION_ERRORS.DOCUMENT_UNREADABLE.MESSAGE });
  });

  it("follows every result page of a multi-page document and keeps each block's page", async () => {
    textractSend
      .mockResolvedValueOnce({
        JobStatus: "SUCCEEDED",
        DocumentMetadata: { Pages: 3 },
        NextToken: "page-2",
        Blocks: [{ Id: "l1", BlockType: "LINE", Text: "Page one", Confidence: 99, Page: 1 }],
      })
      .mockResolvedValueOnce({
        JobStatus: "SUCCEEDED",
        DocumentMetadata: { Pages: 3 },
        Blocks: [{ Id: "l3", BlockType: "LINE", Text: "Page three", Confidence: 99, Page: 3 }],
      });

    const result = await extractedFieldAnalyzeCollect("job-1");

    expect(textractSend.mock.calls.map(([command]) => [command instanceof GetDocumentAnalysisCommand, command.input])).toEqual([
      [true, { JobId: "job-1", NextToken: undefined }],
      [true, { JobId: "job-1", NextToken: "page-2" }],
    ]);
    expect(result).toMatchObject({ status: "succeeded", pageCount: 3 });
    expect(result.status === "succeeded" && result.analysis.lines.map((line) => [line.text, line.page])).toEqual([["Page one", 1], ["Page three", 3]]);
  });

  it("keeps the blocks of a partially successful job", async () => {
    textractSend.mockResolvedValue({ JobStatus: "PARTIAL_SUCCESS", Blocks: [{ Id: "l1", BlockType: "LINE", Text: "Kept", Confidence: 99, Page: 1 }] });

    expect(await extractedFieldAnalyzeCollect("job-1")).toMatchObject({ status: "succeeded", pageCount: 1, analysis: { lines: [{ text: "Kept" }] } });
  });

  it("turns throttling while reading results into the busy AppError", async () => {
    textractSend.mockRejectedValue(new ThrottlingException(METADATA));

    await expect(extractedFieldAnalyzeCollect("job-1")).rejects.toMatchObject({ _status: EXTRACTION_ERRORS.EXTRACTION_BUSY.STATUS });
  });

  it("pairs each key with its value, reading confidence from the value's words and keeping the page", async () => {
    textractSend.mockResolvedValue({
      JobStatus: "SUCCEEDED",
      Blocks: [
        { ...key("k1", 98, ["w1", "w2"], ["v1"], 2), ...geometry(0.1, 0.2, 0.15, 0.02) },
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
      page: 2,
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
      JobStatus: "SUCCEEDED",
      Blocks: [key("k1", 98, ["w1"], ["v1"]), value("v1", 97, ["w2"]), word("w1", "Employee ID"), word("w2", "183B72", 82)],
    });

    const { fields } = await extractedFieldAnalyze();

    expect(fields[0]).toMatchObject({ value: "183B72", confidence: 82, confidenceLevel: "low", requiresReview: true });
  });

  it("doesn't flag a confidently read value because Textract was unsure of its label pairing", async () => {
    textractSend.mockResolvedValue({
      JobStatus: "SUCCEEDED",
      Blocks: [key("k1", 40, ["w1"], ["v1"]), value("v1", 40, ["w2"]), word("w1", "Plan"), word("w2", "Roth", 99)],
    });

    const { fields } = await extractedFieldAnalyze();

    expect(fields[0]).toMatchObject({ value: "Roth", requiresReview: false, issues: [] });
  });

  it("joins the text of every value block a key points to and spans their boxes", async () => {
    textractSend.mockResolvedValue({
      JobStatus: "SUCCEEDED",
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
      JobStatus: "SUCCEEDED",
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
    textractSend.mockResolvedValue({ JobStatus: "SUCCEEDED", Blocks: [key("k1", 97, ["w1"]), word("w1", "Signature")] });

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
    textractSend.mockResolvedValue({ JobStatus: "SUCCEEDED", Blocks: [key("k1", 60, ["w1"], ["v1"]), value("v1", 55, []), word("w1", "Notes")] });

    const { fields } = await extractedFieldAnalyze();

    expect(fields[0]).toMatchObject({ rawValue: "", value: null, confidence: null, confidenceLevel: "unknown", requiresReview: false });
  });

  it("drops a key whose text is empty", async () => {
    textractSend.mockResolvedValue({ JobStatus: "SUCCEEDED", Blocks: [key("k1", 90, [], ["v1"]), value("v1", 90, [])] });

    const { fields } = await extractedFieldAnalyze();

    expect(fields).toEqual([]);
  });

  it("returns each table's cells with their position, role and normalized value, and the table's page and size", async () => {
    textractSend.mockResolvedValue({
      JobStatus: "SUCCEEDED",
      Blocks: [
        { ...table("t1", 96, ["c1", "c2", "c3", "c4", "w9"], 2), ...geometry(0.1, 0.5, 0.8, 0.2) },
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
      page: 2,
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
      JobStatus: "SUCCEEDED",
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
      JobStatus: "SUCCEEDED",
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
    textractSend.mockResolvedValue({ JobStatus: "SUCCEEDED", Blocks: [table("t1", 60, ["c1"]), cell("c1", 1, 1, 99, ["w1"]), word("w1", "IRA", 99)] });

    const { tables } = await extractedFieldAnalyze();

    expect(tables[0]).toMatchObject({ confidenceLevel: "low", requiresReview: true });
  });

  it("drops a table with no cells", async () => {
    textractSend.mockResolvedValue({ JobStatus: "SUCCEEDED", Blocks: [table("t1", 90, ["w1"]), word("w1", "Notes")] });

    const { tables } = await extractedFieldAnalyze();

    expect(tables).toEqual([]);
  });

  it("returns every line of text with its confidence, level, page and box", async () => {
    textractSend.mockResolvedValue({
      JobStatus: "SUCCEEDED",
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
