import { beforeEach, describe, expect, it, vi } from "vitest";

const { retrievalChunkSearch } = vi.hoisted(() => ({ retrievalChunkSearch: vi.fn() }));

vi.mock("../../../../services/retrieval/retrievalChunkMethods.js", () => ({ retrievalChunkSearch }));

const { default: search } = await import("../../../../api/v1/retrieval/search.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("search", () => {
  it("searches with the parsed filters and the default limit", async () => {
    retrievalChunkSearch.mockResolvedValue([]);

    await expect(search.handler({ body: { query: " wages ", filters: { clientId: "h-1", taxYear: 2025 } } } as any, {} as any))
      .resolves.toEqual({ success: true, chunks: [] });
    expect(retrievalChunkSearch).toHaveBeenCalledWith("wages", { clientId: "h-1", taxYear: 2025 }, 8);
  });

  it("refuses a search with no client filter", async () => {
    await expect(search.handler({ body: { query: "wages", filters: {} } } as any, {} as any)).rejects.toMatchObject({ _statusCode: 400 });
    expect(retrievalChunkSearch).not.toHaveBeenCalled();
  });
});
