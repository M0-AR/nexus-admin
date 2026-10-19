import type { ApiErrorShape } from "./types";

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly shape: ApiErrorShape | null;

  constructor(status: number, shape: ApiErrorShape | null) {
    super(shape?.message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = shape?.code;
    this.details = shape?.details;
    this.shape = shape;
  }
}

/* ── In-memory access token (never localStorage — XSS hygiene) ─────────────── */

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

/** Attempts to mint a new access token from the httpOnly refresh cookie. */
export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
        });
        if (!res.ok) return null;
        const bundle = (await res.json()) as { accessToken?: string };
        accessToken = bundle.accessToken ?? null;
        return accessToken;
      } catch {
        return null;
      } finally {
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }
  return refreshInFlight;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Skip the 401 → refresh → retry dance (used for auth endpoints themselves). */
  raw?: boolean;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const doFetch = async (): Promise<Response> =>
    fetch(`${API_BASE}/api${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: {
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

  let res = await doFetch();

  if (res.status === 401 && !options.raw) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else {
      accessToken = null;
      onSessionLost?.();
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, (parsed as ApiErrorShape | null) ?? null);
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};

/** Human-friendly message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "VALIDATION_FAILED" && Array.isArray(err.details)) {
      const first = err.details[0] as { path?: string; message?: string } | undefined;
      if (first?.message) {
        const path = (first.path ?? "").split(".").filter((p) => !/^\d+$/.test(p)).join(" ");
        return path ? `${path}: ${first.message}` : first.message;
      }
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
