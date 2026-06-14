import { state } from '../state';

export class ApiError extends Error {
  status: number;
  body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const data = body as { detail?: string; error?: { message?: string }; message?: string };
  return data.detail || data.error?.message || data.message || fallback;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || undefined);
  if (state.authToken) headers.set('Authorization', `Bearer ${state.authToken}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, {
    ...options,
    headers,
    cache: options.cache ?? 'no-store',
  });

  const contentType = response.headers.get('Content-Type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ApiError(response.status, getErrorMessage(body, `HTTP ${response.status}`), body);
  }

  if (response.status === 204) return undefined as T;
  if (isJson) return body as T;
  return response as unknown as T;
}

export async function apiFetchBlob(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || undefined);
  if (state.authToken) headers.set('Authorization', `Bearer ${state.authToken}`);

  const response = await fetch(path, {
    ...options,
    headers,
    cache: options.cache ?? 'no-store',
  });

  if (!response.ok) {
    let body: unknown = null;
    try { body = await response.json(); } catch { /* ignore */ }
    throw new ApiError(response.status, getErrorMessage(body, `HTTP ${response.status}`), body);
  }

  return response;
}
