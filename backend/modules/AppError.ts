import {ERROR_TYPE} from "../types/native/errors.js"

export class AppError extends Error {
    public _statusCode: number;
    public _status?: string | undefined;

    constructor(error: ERROR_TYPE);
    constructor(message: string, statusCode: number, status?: string);
    constructor(
        messageOrError: string | ERROR_TYPE,
        statusCode?: number,
        status?: string
    ) {
        if (typeof messageOrError === "string") {
            super(messageOrError);
            this._statusCode = statusCode ?? 500;
            this._status = status;
        } else {
            super(messageOrError.MESSAGE);
            this._statusCode = messageOrError.HTTP_CODE;
            this._status = messageOrError.STATUS as string | undefined;
        }
    }
}
