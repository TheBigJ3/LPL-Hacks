import { beforeEach, describe, expect, it, vi } from "vitest";

const { answerAsk } = vi.hoisted(() => ({ answerAsk: vi.fn() }));

vi.mock("../../../../services/answer/answerMethods.js", () => ({ answerAsk }));

const { default: ask } = await import("../../../../api/v1/answer/ask.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ask", () => {
  it("answers the trimmed question for the given client", async () => {
    const result = { answerable: false, statements: [], filters: { clientId: "h-1" } };
    answerAsk.mockResolvedValue(result);

    await expect(ask.handler({ body: { question: " wages? ", clientId: "h-1" } } as any, {} as any)).resolves.toEqual({ success: true, ...result });
    expect(answerAsk).toHaveBeenCalledWith("wages?", "h-1");
  });

  it("refuses a question with no client", async () => {
    await expect(ask.handler({ body: { question: "wages?" } } as any, {} as any)).rejects.toMatchObject({ _statusCode: 400 });
    expect(answerAsk).not.toHaveBeenCalled();
  });
});
