import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_ERRORS } from "../../../types/native/clients/errors.js";
import { UPLOAD_REQUEST_ERRORS } from "../../../types/native/uploadRequests/errors.js";

const { db, results, calls } = vi.hoisted(() => {
  const results: unknown[][] = [];
  const calls: { method: string; args: unknown[] }[] = [];

  const chain = (): any => new Proxy({}, {
    get: (_target, prop) => {
      if (prop === "then") {
        const value = results.shift() ?? [];
        return (resolve: (value: unknown) => void) => resolve(value);
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return chain();
      };
    },
  });

  return { db: chain(), results, calls };
});

vi.mock("../../../loaders/postgresLoader.js", () => ({ db }));

const {
  uploadRequestCreate,
  uploadRequestList,
  uploadRequestRevoke,
  uploadRequestSubmit,
  uploadRequestGetUploadTarget,
} = await import("../../../services/uploadRequests/uploadRequestMethods.js");

const ADVISOR_ID = "00000000-0000-4000-8000-000000000001";
const CLIENT_ID = "6b0f1d3c-1f2a-4c5e-9d8b-7a6c5b4e3d21";
const REQUEST_ID = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const TOKEN = "a".repeat(32);
const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 1000);

const requestRecord = (overrides: Record<string, unknown> = {}) => ({
  id: REQUEST_ID,
  clientId: CLIENT_ID,
  advisorId: ADVISOR_ID,
  requestedBy: "Demo Advisor",
  token: TOKEN,
  note: null,
  status: "open",
  expiresAt: FUTURE,
  submittedAt: null,
  createdAt: new Date("2026-10-03T12:00:00Z"),
  updatedAt: new Date("2026-10-03T12:00:00Z"),
  ...overrides,
});

const callArgs = (method: string) => calls.filter((call) => call.method === method).map((call) => call.args[0]);

beforeEach(() => {
  results.length = 0;
  calls.length = 0;
});

describe("uploadRequestCreate", () => {
  it("refuses a client the advisor doesn't have, before creating anything", async () => {
    results.push([]);

    await expect(uploadRequestCreate({ advisorId: ADVISOR_ID, requestedBy: "Demo Advisor", clientId: CLIENT_ID, expiresInDays: 7 }))
      .rejects.toMatchObject({ _status: CLIENT_ERRORS.CLIENT_NOT_FOUND.STATUS });
    expect(callArgs("insert")).toEqual([]);
  });

  it("issues a 32-character url-safe token that expires after the chosen days, and drops a blank note", async () => {
    results.push([{ id: CLIENT_ID }], [requestRecord()]);
    const before = Date.now();

    const request = await uploadRequestCreate({ advisorId: ADVISOR_ID, requestedBy: "Demo Advisor", clientId: CLIENT_ID, note: "", expiresInDays: 3 });

    const [values] = callArgs("values") as [{ token: string; note: string | null; expiresAt: Date }];
    expect(values.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(values.note).toBeNull();
    expect(values.expiresAt.getTime() - before).toBeGreaterThanOrEqual(3 * 24 * 60 * 60 * 1000);
    expect(values.expiresAt.getTime() - before).toBeLessThan(3 * 24 * 60 * 60 * 1000 + 5000);
    expect(request).toMatchObject({ id: REQUEST_ID, state: "open", documents: [] });
  });
});

describe("uploadRequestList", () => {
  it("groups each request's documents and keeps requests that received none", async () => {
    const document = { id: "d1", fileName: "w2.pdf", status: "extracted", pageCount: 1, failureMessage: null };
    const empty = requestRecord({ id: "r2", status: "open", expiresAt: PAST });
    results.push([
      { request: requestRecord({ status: "submitted" }), document },
      { request: requestRecord({ status: "submitted" }), document: { ...document, id: "d2" } },
      { request: empty, document: null },
    ]);

    const requests = await uploadRequestList(ADVISOR_ID, CLIENT_ID);

    expect(requests.map((request) => [request.id, request.state, request.documents.map((item) => item.id)])).toEqual([
      [REQUEST_ID, "submitted", ["d1", "d2"]],
      ["r2", "expired", []],
    ]);
  });
});

describe("uploadRequestRevoke", () => {
  it("revokes an open request in one write", async () => {
    results.push([{ id: REQUEST_ID }]);

    await expect(uploadRequestRevoke(ADVISOR_ID, REQUEST_ID)).resolves.toBeUndefined();
    expect(callArgs("set")).toEqual([{ status: "revoked" }]);
    expect(callArgs("select")).toEqual([]);
  });

  it("says the request is no longer open when it exists but the CAS matched nothing", async () => {
    results.push([], [{ id: REQUEST_ID }]);

    await expect(uploadRequestRevoke(ADVISOR_ID, REQUEST_ID)).rejects.toMatchObject({ _status: UPLOAD_REQUEST_ERRORS.REQUEST_NOT_OPEN.STATUS });
  });

  it("says not found when the advisor has no such request", async () => {
    results.push([], []);

    await expect(uploadRequestRevoke(ADVISOR_ID, REQUEST_ID)).rejects.toMatchObject({ _status: UPLOAD_REQUEST_ERRORS.REQUEST_NOT_FOUND.STATUS });
  });
});

describe("uploadRequestGetUploadTarget", () => {
  it("points an upload at the request's client", async () => {
    results.push([{ id: REQUEST_ID, clientId: CLIENT_ID, status: "open", expiresAt: FUTURE, documentCount: 2 }]);

    await expect(uploadRequestGetUploadTarget(TOKEN)).resolves.toEqual({ uploadRequestId: REQUEST_ID, clientId: CLIENT_ID });
  });

  it("rejects an unknown token", async () => {
    results.push([]);

    await expect(uploadRequestGetUploadTarget(TOKEN)).rejects.toMatchObject({ _status: UPLOAD_REQUEST_ERRORS.REQUEST_NOT_FOUND.STATUS });
  });
});

describe("uploadRequestSubmit", () => {
  it("closes the link and reports how many files it received", async () => {
    results.push([{ id: REQUEST_ID, clientId: CLIENT_ID, status: "open", expiresAt: FUTURE, documentCount: 3 }], [{ id: REQUEST_ID }]);

    await expect(uploadRequestSubmit(TOKEN)).resolves.toBe(3);
    expect(callArgs("set")).toEqual([{ status: "submitted", submittedAt: expect.any(Date) }]);
  });

  it("fails when the link was closed between the read and the CAS", async () => {
    results.push([{ id: REQUEST_ID, clientId: CLIENT_ID, status: "open", expiresAt: FUTURE, documentCount: 1 }], []);

    await expect(uploadRequestSubmit(TOKEN)).rejects.toMatchObject({ _status: UPLOAD_REQUEST_ERRORS.REQUEST_NOT_OPEN.STATUS });
  });

  it("doesn't write when the link has no files", async () => {
    results.push([{ id: REQUEST_ID, clientId: CLIENT_ID, status: "open", expiresAt: FUTURE, documentCount: 0 }]);

    await expect(uploadRequestSubmit(TOKEN)).rejects.toMatchObject({ _status: UPLOAD_REQUEST_ERRORS.REQUEST_EMPTY.STATUS });
    expect(callArgs("set")).toEqual([]);
  });
});
