import type { Request } from "express";
import type { Readable } from "stream";
import { AppError } from "./AppError.js";
import { GENERAL_ERRORS } from "../types/native/errors.js";

type UploadRequestRules = {
    mimeTypes: readonly string[];
    maxBytes: number;
};

export type UploadRequest = {
    body: Readable;
    contentType: string;
    contentLength: number;
};

export function readUploadRequest(req: Request, rules: UploadRequestRules): UploadRequest {
    const contentType = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    if (!rules.mimeTypes.includes(contentType)) {
        throw new AppError(GENERAL_ERRORS.UPLOAD_TYPE_INVALID);
    }

    const declaredLength = Number(req.headers["content-length"]);
    if (!Number.isInteger(declaredLength) || declaredLength <= 0) {
        throw new AppError(GENERAL_ERRORS.UPLOAD_LENGTH_REQUIRED);
    }

    if (declaredLength > rules.maxBytes) {
        throw new AppError(GENERAL_ERRORS.UPLOAD_TOO_LARGE);
    }

    return { body: req, contentType, contentLength: declaredLength };
}
