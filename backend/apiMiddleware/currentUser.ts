import type { Request, Response, NextFunction } from "express";
import type { UserRequest } from "../types/native/api/RouteHandler.js";
import { userGetCurrent } from "../services/users/userMethods.js";

export function currentUser(req: Request, _res: Response, next: NextFunction): void {
  (req as UserRequest).user = userGetCurrent();
  next();
}
