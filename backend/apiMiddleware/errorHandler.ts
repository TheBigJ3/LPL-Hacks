import type { Request, Response, NextFunction } from "express";
import { AppError } from "../modules/AppError.js";
import { ServerError } from "../modules/ServerError.js";
import { RouteResponse } from "@lpl-hacks/shared/src/types/native/api/RouteResponse.js";

export function errorHandler
(err: Error, req: Request, res: Response, next: NextFunction) {
    if (err instanceof AppError) {
        return res.status(err._statusCode).json({
            success: false,
            statusCode: err._status,
            message: err.message,
        } as RouteResponse);
    }

    if (err instanceof ServerError) {
        console.error(err._servermessage ,err.stack)
        return res.status(500).json({
            success: false,
            code: "INTERNAL_ERROR",
            message: err._message
        })
    }

    console.error(err);
    return res.status(500).json({
        success: false,
        code: "INTERNAL_ERROR",
        message: 'INTERNAL ERROR',
    });
}