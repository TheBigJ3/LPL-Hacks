import { describe, expect, it } from "vitest";
import { envFileFill } from "../../modules/envFileFill.js";

describe("envFileFill", () => {
  it("fills blank keys in place and keeps the rest of the file as it was", () => {
    const result = envFileFill("# Knowledge base\nBEDROCK_KNOWLEDGE_BASE_ID=\nPORT=3001\n", { BEDROCK_KNOWLEDGE_BASE_ID: "KB123" }, "header");

    expect(result.content).toBe("# Knowledge base\nBEDROCK_KNOWLEDGE_BASE_ID=KB123\nPORT=3001\n");
    expect(result.filled).toEqual(["BEDROCK_KNOWLEDGE_BASE_ID"]);
  });

  it("never replaces a value someone already set", () => {
    const result = envFileFill("BEDROCK_KNOWLEDGE_BASE_ID=MINE\n", { BEDROCK_KNOWLEDGE_BASE_ID: "KB123" }, "header");

    expect(result.content).toBe("BEDROCK_KNOWLEDGE_BASE_ID=MINE\n");
    expect(result.filled).toEqual([]);
  });

  it("appends keys the file doesn't have under a comment", () => {
    const result = envFileFill("PORT=3001", { INSIGHT_HARNESS_ARN: "arn:x" }, "Filled in by npm run dev.");

    expect(result.content).toBe("PORT=3001\n\n# Filled in by npm run dev.\nINSIGHT_HARNESS_ARN=arn:x\n");
    expect(result.filled).toEqual(["INSIGHT_HARNESS_ARN"]);
  });

  it("leaves the file unchanged when there is nothing to fill", () => {
    expect(envFileFill("PORT=3001\n", {}, "header")).toEqual({ content: "PORT=3001\n", filled: [] });
  });
});
