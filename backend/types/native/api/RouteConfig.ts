export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RouteConfig = {
  method: HttpMethod;
  rateLimitPoints?: number;
};
