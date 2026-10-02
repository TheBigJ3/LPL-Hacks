export interface RouteResponse<TData = unknown> {
  success: boolean;
  message?: string;
  data?: TData;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};
