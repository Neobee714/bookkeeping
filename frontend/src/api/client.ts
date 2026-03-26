import axios, {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from 'axios';

import { useAuthStore, getStoredAccessToken, getStoredRefreshToken } from '@/store/authStore';
import type { ApiResponse, RefreshTokenData } from '@/types';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';
const rawTimeoutMs = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? '30000');
const requestTimeoutMs = Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0 ? rawTimeoutMs : 30000;

const client = axios.create({
  baseURL,
  timeout: requestTimeoutMs,
});

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
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    return null;
  }

  const response = await axios.post<ApiResponse<RefreshTokenData>>(
    `${baseURL}/auth/refresh`,
    { refresh_token: refreshToken },
  );

  if (!response.data.success || !response.data.data?.access_token) {
    return null;
  }

  const nextAccessToken = response.data.data.access_token;
  useAuthStore.getState().setAccessToken(nextAccessToken);
  return nextAccessToken;
};

client.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
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
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    const retriedRequest = withAuthHeader(originalRequest, nextToken);
    return client(retriedRequest);
  },
);

export default client;
