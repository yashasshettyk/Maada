import { randomUUID } from 'node:crypto';
import { createApp, type AppOptions } from '../server/app.js';
import { createPgliteDatabase } from '../server/db/pglite.js';
import { migrate } from '../server/db/migrate.js';
import { clearCategoryCache } from '../server/services/ledger.js';

export const id = () => randomUUID();

/** A fresh in-memory Postgres with the real schema, plus the real API on top of it. */
export async function setup(opts: AppOptions = {}) {
  clearCategoryCache();
  const db = await createPgliteDatabase();
  await migrate(db);
  const app = createApp(db, { writeRateLimit: 0, ...opts });
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json()) as any;
    return { status: res.status, body: json };
  };
  const ok = async (method: string, path: string, body?: unknown) => {
    const r = await call(method, path, body);
    if (r.status >= 400) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const balance = async () => (await ok('GET', '/dashboard')).balance as number;
  const category = async (name: string) =>
    ((await ok('GET', '/categories')).items as any[]).find((c) => c.name === name).id as string;
  const sankranti = async () =>
    ((await ok('GET', '/rituals')).items as any[]).find((r) => r.name === 'Sankranti Seve').id as string;
  return { db, app, call, ok, balance, category, sankranti };
}

export const RUPEE = 100;
