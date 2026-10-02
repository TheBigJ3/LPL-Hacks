import type { Request, Response } from 'express';
import type { RouteResponse } from "@lpl-hacks/shared/src/types/native/api/RouteResponse.js"
import type { User } from "@lpl-hacks/shared/src/types/native/users/user.js"

export type UserRequest = Request & {
  user: User
};

export type RouteHandler = (
  req: UserRequest,
  res: Response
) => Promise<RouteResponse>;
