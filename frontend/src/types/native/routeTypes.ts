import type { UseQueryOptions } from "@tanstack/react-query";

export type RouteHandler<P = void, R = unknown> = {
  identifier : string,
  apiPath : string,
  sendCredentials : boolean,
  queryConfig?: Omit<UseQueryOptions<R>, "queryKey" | "queryFn">,

  readonly _params? : P,
  readonly _response? : R
}

export type AnyRoute = RouteHandler<any, any>

export type ParamsOf<H> = H extends RouteHandler<infer P, any> ? P : never
export type ResponseOf<H> = H extends RouteHandler<any, infer R> ? R : never

export function defineRoute<P = void, R = unknown>(
  route : Omit<RouteHandler<P, R>, "_params" | "_response">
) : RouteHandler<P, R> {
  return route
}

export type ApiErrorBody = {
  success: false;
  statusCode: string;
  message: string;
};

export interface ApiReponse {
  status : true
}
