import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelError, ModelNotReadyException } from "@aws-sdk/client-sagemaker-runtime";
import { ServerError } from "../../../modules/ServerError.js";
import { OPENDECISION_ERRORS } from "../../../types/native/opendecision/errors.js";

const { opendecisionSend } = vi.hoisted(() => ({ opendecisionSend: vi.fn() }));

vi.mock("../../../loaders/opendecisionLoader.js", () => ({
  OPENDECISION_ENDPOINT_NAME: "test-endpoint",
  opendecision_client: { send: opendecisionSend },
}));

const { opendecisionInvoke } = await import("../../../services/opendecision/opendecisionMethods.js");

const METADATA = { $metadata: {}, message: "sagemaker said no" };
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (body: Uint8Array) => JSON.parse(new TextDecoder().decode(body));

describe("opendecisionInvoke", () => {
  beforeEach(() => {
    opendecisionSend.mockReset();
  });

  it("routes the operation through CustomAttributes and returns the parsed body", async () => {
    opendecisionSend.mockResolvedValue({ Body: encode({ overview: { household_id: "HH1" } }) });

    const result = await opendecisionInvoke("overview", { household: { household_id: "HH1" } });

    expect(result).toEqual({ overview: { household_id: "HH1" } });
    const { input } = opendecisionSend.mock.calls[0][0];
    expect(input).toMatchObject({ EndpointName: "test-endpoint", CustomAttributes: "operation=overview", ContentType: "application/json" });
    expect(decode(input.Body)).toEqual({ household: { household_id: "HH1" } });
  });

  it("sends an empty object when no body is given", async () => {
    opendecisionSend.mockResolvedValue({ Body: encode({ status: "ok" }) });

    await opendecisionInvoke("health");

    expect(decode(opendecisionSend.mock.calls[0][0].input.Body)).toEqual({});
  });

  it("throws ANALYSIS_BUSY while the endpoint is not ready", async () => {
    opendecisionSend.mockRejectedValue(new ModelNotReadyException(METADATA));

    await expect(opendecisionInvoke("health")).rejects.toMatchObject({ _status: OPENDECISION_ERRORS.ANALYSIS_BUSY.STATUS });
  });

  it("throws REQUEST_TOO_LARGE when the container answers 413", async () => {
    opendecisionSend.mockRejectedValue(new ModelError({ ...METADATA, OriginalStatusCode: 413 }));

    await expect(opendecisionInvoke("overview", {})).rejects.toMatchObject({ _status: OPENDECISION_ERRORS.REQUEST_TOO_LARGE.STATUS });
  });

  it("throws a ServerError with the container's status and body for any other non-200", async () => {
    opendecisionSend.mockRejectedValue(new ModelError({ ...METADATA, OriginalStatusCode: 422, OriginalMessage: '{"status":"needs_review"}' }));

    const err = await opendecisionInvoke("overview", {}).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ServerError);
    expect((err as ServerError)._servermessage).toBe('[opendecision] overview returned 422: {"status":"needs_review"}');
  });
});
