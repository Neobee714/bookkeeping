import axios, {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from 'axios';

import { API_BASE_URL, API_TIMEOUT_MS } from '../config';
import { useAuthStore } from '../store/authStore';
import type { ApiResponse, RefreshTokenData } from '../types';

/**
 * 统一 API 客户端(axios 实例)。
 *
 * 拦截器职责:
 * - 请求:自动附带 `Authorization: Bearer <accessToken>`;
 * - 响应:401 时用 refreshToken 调 /auth/refresh 换新并重放原请求;
 *   刷新失败则清空会话(跳登录)。
 */
const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
});

/** 并发刷新去重:同一时刻只发起一次 refresh。 */
let refreshPromise: Promise<string | null> | null = null;

const withAuthHeader = (
  config: InternalAxiosRequestConfig,
  token: string,
): InternalAxiosRequestConfig => {
  const headers =
    config.headers instanceof AxiosHeaders
      ? config.headers
      : new AxiosHeaders(config.headers);
  headers.set('Authorization', `Bearer ${token}`);
  config.headers = headers;
  return config;
};

const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await axios.post<ApiResponse<RefreshTokenData>>(
      `${API_BASE_URL}/auth/refresh`,
      { refresh_token: refreshToken },
    );

    if (!response.data.success || !response.data.data?.access_token) {
      return null;
    }

    const { access_token: nextAccessToken, refresh_token: nextRefreshToken } =
      response.data.data;
    await useAuthStore.getState().setTokens(
      nextAccessToken,
      nextRefreshToken || refreshToken,
    );
    return nextAccessToken;
  } catch {
    return null;
  }
};

client.interceptors.request.use(async (config) => {
  const token = useAuthStore.getState().accessToken;
  if (!token) {
    return config;
  }
  return withAuthHeader(config, token);
});

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & {
      _retry?: boolean;
    }) | null;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    const url = originalRequest.url ?? '';
    const shouldSkip =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/refresh');

    const shouldRefresh =
      error.response?.status === 401 && !originalRequest._retry && !shouldSkip;

    if (!shouldRefresh) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    const nextToken = await refreshPromise;
    if (!nextToken) {
      await useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    const retriedRequest = withAuthHeader(originalRequest, nextToken);
    return client(retriedRequest);
  },
);

/** 从后端统一响应结构中解出 data;success=false 时抛出业务错误。 */
export function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) {
    throw new Error(response.message || '请求失败');
  }
  return response.data;
}

/** 提取可展示的错误信息(HTTP detail / 业务 message / 网络错误 / 超时)。 */
export function extractErrorMessage(
  error: unknown,
  fallback = '网络异常,请稍后重试',
): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { detail?: string; message?: string }
      | undefined;
    if (data?.detail) {
      return String(data.detail);
    }
    if (data?.message) {
      return String(data.message);
    }
    if (error.code === 'ECONNABORTED') {
      return '请求超时,请稍后重试';
    }
    if (!error.response) {
      return '网络连接失败,请检查网络';
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export default client;
