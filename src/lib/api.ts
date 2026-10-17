/** Thin client for the Maada API. Every response error becomes an ApiError with a readable message. */

const ENV_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const ENV_KEY = (import.meta.env.VITE_API_KEY as string | undefined) ?? '';
const SERVER_KEY = 'maada.server';

export interface ServerConfig { url: string; key: string }

/** Server address and access key: saved on this device (set in the app), else the build-time defaults. */
export function getServer(): ServerConfig {
  try {
    const saved = JSON.parse(localStorage.getItem(SERVER_KEY) ?? 'null');
    if (saved?.url) return { url: String(saved.url), key: String(saved.key ?? '') };
  } catch { /* storage unavailable */ }
  return { url: ENV_BASE, key: ENV_KEY };
}

export function setServer(cfg: ServerConfig) {
  localStorage.setItem(SERVER_KEY, JSON.stringify({ url: normaliseUrl(cfg.url), key: cfg.key.trim() }));
}

export function normaliseUrl(url: string) {
  let u = url.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

/** Check a server address and key before saving them. Throws a readable error. */
export async function testServer(cfg: ServerConfig) {
  const base = normaliseUrl(cfg.url);
  let res: Response;
  try {
    res = await fetch(`${base}/api/settings`, { headers: cfg.key ? { 'x-maada-key': cfg.key.trim() } : {} });
  } catch {
    throw new ApiError(0, 'network', 'Could not reach this address. Check it and your internet connection.');
  }
  if (res.status === 401) throw new ApiError(401, 'unauthorized', 'The server is reachable but the access key is wrong.');
  if (!res.ok) throw new ApiError(res.status, 'http_error', `The server answered with an error (${res.status}).`);
  const body = await res.json().catch(() => null);
  if (!body?.settings) throw new ApiError(0, 'not_maada', 'This address does not look like the Maada server.');
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export function apiUrl(path: string) {
  return `${getServer().url}/api${path}`;
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...rest,
      headers: {
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(getServer().key ? { 'x-maada-key': getServer().key } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, 'network', navigator.onLine === false
      ? 'You are offline. Please connect to the internet and try again.'
      : 'Could not reach the server. Please try again.');
  }
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(res.status, e?.code ?? 'http_error', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return body as T;
}

export const get = <T = any>(path: string) => api<T>(path);
export const post = <T = any>(path: string, json?: unknown, headers?: Record<string, string>) => api<T>(path, { method: 'POST', json: json ?? {}, headers });
export const put = <T = any>(path: string, json: unknown) => api<T>(path, { method: 'PUT', json });
export const patch = <T = any>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });

/** Build a query string, skipping empty values. */
export function qs(params: object) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params) as [string, unknown][]) if (v !== null && v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** A new record id generated on the device, so a repeated save never creates a duplicate. */
export function newId(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
