// API client for the nayana.ai FastAPI backend.
//
// Auth model:
// - Access token lives in memory only (module-level), sent as Bearer.
// - Refresh + guest tokens are httpOnly cookies; fetch uses credentials:include.
// - On a 401 the client tries POST /api/auth/refresh once, then retries.

import type { ApiErrorShape } from "./types";

export class ApiError extends Error {
  status: number;
  payload: ApiErrorShape;

  constructor(status: number, payload: ApiErrorShape, fallback: string) {
    super(payload.message || fallback);
    this.status = status;
    this.payload = payload;
  }

  get code(): string | undefined {
    return this.payload.code;
  }
}

// The backend runs on :8000 in dev; in prod the static export is served by
// FastAPI itself so requests are same-origin.
export function apiBase(): string {
  if (typeof window === "undefined") return "";
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, "");
  if (window.location.port === "3000") return "http://localhost:8000";
  return "";
}

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function tryRefresh(): Promise<boolean> {
  // Deduplicate concurrent refreshes.
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.access_token) {
          accessToken = data.access_token;
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        // Allow the next 401 to trigger a fresh attempt.
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      }
    })();
  }
  return refreshPromise;
}

type Json = Record<string, unknown> | unknown[] | null;

async function request<T>(
  path: string,
  init: RequestInit = {},
  retryOn401 = true
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && retryOn401) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, init, false);
  }

  if (!res.ok) {
    let payload: ApiErrorShape = {};
    try {
      const body = await res.json();
      payload =
        typeof body?.detail === "object" && body.detail !== null
          ? body.detail
          : { message: body?.detail ?? body?.message };
    } catch {
      payload = {};
    }
    throw new ApiError(res.status, payload, `Request failed: ${res.status}`);
  }

  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: Json) =>
    request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
