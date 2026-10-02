import axios, {
  type AxiosRequestConfig,
  type AxiosResponseHeaders,
  type RawAxiosResponseHeaders,
} from "axios";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import {
  type AnyRoute,
  type ApiErrorBody,
  type ParamsOf,
  type ResponseOf,
} from "../types/native/routeTypes";
import { GENERAL_ERRORS } from "../types/native/generalErrors";

export const BASE_URL = import.meta.env.VITE_API_URL as string;

function buildPath(apiPath: string, params: Record<string, unknown>) {
  const query = { ...params }

  const path = apiPath.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    if (!(key in query)) {
      throw new Error(`Missing path param "${key}" for ${apiPath}`)
    }
    const value = String(query[key])
    delete query[key]
    return encodeURIComponent(value)
  })

  return { path, query }
}

function serializeParams(params: Record<string, unknown>): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, String(item)))
    } else {
      search.append(key, String(value))
    }
  }

  return search.toString()
}

export type ApiResponseHeaders = RawAxiosResponseHeaders | AxiosResponseHeaders

export type ApiResult<T> =
  | { success: true, data: T, headers: ApiResponseHeaders }
  | { success: false, httpStatus?: number, error: ApiErrorBody, headers?: ApiResponseHeaders }

type RequestArgs<H extends AnyRoute> = ParamsOf<H> extends void
  ? [params?: undefined, axiosRequestConfig?: AxiosRequestConfig]
  : [params: ParamsOf<H>, axiosRequestConfig?: AxiosRequestConfig]

function buildHeaders(axiosRequestConfig: AxiosRequestConfig): NonNullable<AxiosRequestConfig["headers"]> {
  return { ...axiosRequestConfig.headers }
}

function handleRequestError<T>(endpointHandler: AnyRoute, err: unknown): ApiResult<T> {
  if (!axios.isAxiosError<ApiErrorBody>(err)) throw err

  if (!err.response) {
    console.error(`Request failed for ${endpointHandler.apiPath}: ${err.message}`)
    return {
      success: false,
      error: {
        success: false,
        statusCode: GENERAL_ERRORS.NETWORK_UNREACHABLE.STATUS,
        message: GENERAL_ERRORS.NETWORK_UNREACHABLE.MESSAGE,
      },
    }
  }

  const body = err.response.data
  const error: ApiErrorBody = typeof body?.statusCode === "string"
    ? body
    : {
        success: false,
        statusCode: GENERAL_ERRORS.UNEXPECTED_RESPONSE.STATUS,
        message: GENERAL_ERRORS.UNEXPECTED_RESPONSE.MESSAGE,
      }

  console.error(
    typeof body?.statusCode === "string"
      ? `Error [${error.statusCode}] ${error.message} (${err.response.status})`
      : `Error HTTP ${err.response.status} for ${endpointHandler.apiPath}`
  )

  return {
    success: false,
    httpStatus: err.response.status,
    error,
    headers: err.response.headers,
  }
}

export async function apiGetRequest<H extends AnyRoute>(
  endpointHandler: H,
  ...[params, axiosRequestConfig = {}]: RequestArgs<H>
): Promise<ApiResult<ResponseOf<H>>> {

  const headers = buildHeaders(axiosRequestConfig)

  const { path, query } = buildPath(
    endpointHandler.apiPath,
    (params ?? {}) as Record<string, unknown>
  )

  try {
    const res = await axios.get<ResponseOf<H>>(path, {
      baseURL: BASE_URL,
      ...axiosRequestConfig,
      headers,
      params: { ...query, ...axiosRequestConfig.params },
      paramsSerializer: serializeParams,
      withCredentials: endpointHandler.sendCredentials,
    })

      return { success: true, data: res.data, headers: res.headers }
  } catch (err) {
    return handleRequestError(endpointHandler, err)
  }
}

type QueryArgs<H extends AnyRoute> = ParamsOf<H> extends void
  ? [params?: undefined, queryOptions?: Omit<UseQueryOptions<ResponseOf<H>>, "queryKey" | "queryFn">]
  : [params: ParamsOf<H>, queryOptions?: Omit<UseQueryOptions<ResponseOf<H>>, "queryKey" | "queryFn">]

export function useApiGetQuery<H extends AnyRoute>(
  endpointHandler: H,
  ...[params, queryOptions]: QueryArgs<H>
) {
  return useQuery<ResponseOf<H>>({
    queryKey: [endpointHandler.identifier, params ?? null],
    queryFn: async () => {
      const requestArgs = (params === undefined ? [] : [params]) as RequestArgs<H>
      const result = await apiGetRequest(endpointHandler, ...requestArgs)

      if (!result.success) {
        throw new Error(result.error.message)
      }

      return result.data
    },
    ...endpointHandler.queryConfig,
    ...queryOptions,
  })
}

export async function apiPostRequest<H extends AnyRoute>(
  endpointHandler: H,
  ...[params, axiosRequestConfig = {}]: RequestArgs<H>
): Promise<ApiResult<ResponseOf<H>>> {

  const headers = buildHeaders(axiosRequestConfig)

  const { path, query: body } = buildPath(
    endpointHandler.apiPath,
    (params ?? {}) as Record<string, unknown>
  )

  try {
    const res = await axios.post<ResponseOf<H>>(path, body, {
      baseURL: BASE_URL,
      ...axiosRequestConfig,
      headers,
      withCredentials: endpointHandler.sendCredentials,
    })

      return { success: true, data: res.data, headers: res.headers }
  } catch (err) {
    return handleRequestError(endpointHandler, err)
  }
}

export async function apiUploadRequest<H extends AnyRoute>(
  endpointHandler: H,
  params: ParamsOf<H>,
  file: Blob,
  axiosRequestConfig: AxiosRequestConfig = {}
): Promise<ApiResult<ResponseOf<H>>> {

  const headers = buildHeaders(axiosRequestConfig)
  headers["Content-Type"] = file.type

  const { path, query } = buildPath(
    endpointHandler.apiPath,
    (params ?? {}) as Record<string, unknown>
  )

  try {
    const res = await axios.post<ResponseOf<H>>(path, file, {
      baseURL: BASE_URL,
      ...axiosRequestConfig,
      headers,
      params: { ...query, ...axiosRequestConfig.params },
      paramsSerializer: serializeParams,
      withCredentials: endpointHandler.sendCredentials,
    })

      return { success: true, data: res.data, headers: res.headers }
  } catch (err) {
    return handleRequestError(endpointHandler, err)
  }
}
