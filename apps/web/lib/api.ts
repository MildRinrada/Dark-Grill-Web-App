'use client';

import type { ApiErrorBody, SessionUser } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<SessionUser | null> | null = null;
const listeners = new Set<(user: SessionUser | null) => void>();

export function onSessionChange(fn: (user: SessionUser | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setSession(token: string | null, user: SessionUser | null) {
  accessToken = token;
  listeners.forEach((fn) => fn(user));
}

export function getAccessToken() {
  return accessToken;
}

/** Exchanges the httpOnly refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<SessionUser | null> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) {
        setSession(null, null);
        return null;
      }
      const body = (await res.json()) as { accessToken: string; user: SessionUser };
      setSession(body.accessToken, body.user);
      return body.user;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

interface Options {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const res = await fetch(`/api/v1${path}`, {
    method: opts.method ?? 'GET',
    credentials: 'same-origin',
    signal: opts.signal,
    headers: {
      ...(isForm || opts.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
    },
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
  });

  if (res.status === 401 && !retried && accessToken) {
    const user = await refreshSession();
    if (user) return api<T>(path, opts, true);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? 'Something went wrong', err?.details);
  }
  return data as T;
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}
