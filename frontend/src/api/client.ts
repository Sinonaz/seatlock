import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiErrorBody, ApiErrorCode, AuthResponse } from '@/types';
import { mockAdapter } from './mock/mockServer';
import { t } from '@/i18n';

export const API_URL = import.meta.env.VITE_API_URL || '/api';

// Normalized error that every API call rejects with
export class ApiError extends Error {
  readonly status?: number;
  readonly code?: ApiErrorCode;

  constructor(message: string, status?: number, code?: ApiErrorCode) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  // Sends the httpOnly refresh_token cookie to /api/auth/*
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// --- Access token lives in memory only (never in localStorage) ---
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

// --- Mock mode: requests are answered by an in-browser fake backend ---
let mockMode = false;

export function setApiMockMode(enabled: boolean) {
  mockMode = enabled;
}

// --- Hooks the auth store registers to react to refresh results ---
interface SessionHandlers {
  onRefreshed?: (res: AuthResponse) => void;
  onExpired?: () => void;
}
const sessionHandlers: SessionHandlers = {};

export function registerSessionHandlers(handlers: SessionHandlers) {
  Object.assign(sessionHandlers, handlers);
}

apiClient.interceptors.request.use((config) => {
  if (mockMode) {
    config.adapter = mockAdapter;
  }
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Endpoints that must never trigger an automatic refresh (would loop)
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh'];

function isAuthEndpoint(url?: string) {
  return !!url && AUTH_ENDPOINTS.some((endpoint) => url.startsWith(endpoint));
}

// Single-flight refresh: ten parallel 401s produce one POST /auth/refresh
let refreshPromise: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post<AuthResponse>('/auth/refresh')
      .then((res) => {
        setAccessToken(res.data.accessToken);
        sessionHandlers.onRefreshed?.(res.data);
        return res.data.accessToken;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function toApiError(error: AxiosError<ApiErrorBody>): ApiError {
  if (error.response) {
    const body = error.response.data;
    const rawMessage = body?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(', ')
      : rawMessage || t('api.serverError', { status: error.response.status });
    return new ApiError(message, error.response.status, body?.code);
  }
  if (error.request) {
    return new ApiError(t('api.unreachable', { url: API_URL }));
  }
  return new ApiError(error.message);
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as RetriableConfig | undefined;

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthEndpoint(original.url)
    ) {
      original._retry = true;
      const token = await refreshAccessToken();
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return apiClient(original);
      }
      sessionHandlers.onExpired?.();
    }

    return Promise.reject(toApiError(error));
  },
);
