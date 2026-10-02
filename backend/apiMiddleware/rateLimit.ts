import type { Request, Response, NextFunction, RequestHandler } from "express";
import { GENERAL_ERRORS } from "../types/native/errors.js";
import { AppError } from "../modules/AppError.js";
import { rateLimitConsume } from "../services/rateLimit/rateLimitMethods.js";

export function rateLimit(cost: number): RequestHandler {
  return async function rateLimitHandler(req: Request, res: Response, next: NextFunction) {
    try {
      await rateLimitApply(req, res, cost);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export async function rateLimitApply(req: Request, res: Response, cost: number): Promise<void> {
  const result = await rateLimitConsume(undefined, req.ip ?? "", cost);

  res.setHeader("X-RateLimit-Remaining", result.remaining);

  if (!result.allowed) {
    res.setHeader("Retry-After", result.retryAfter);
    throw new AppError(GENERAL_ERRORS.TOO_MANY_REQUESTS);
  }
}
