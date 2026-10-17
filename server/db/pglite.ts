import { PGlite, types } from '@electric-sql/pglite';
import type { Database, Queryable } from './types.js';

/** Embedded Postgres (WASM) used for tests and for local development without a server. */
export async function createPgliteDatabase(dataDir?: string): Promise<Database> {
  // Constructor-level parsers do not override every built-in type, so pass them per query.
  const parsers = {
    [types.INT8]: (v: string) => Number(v),
    [types.DATE]: (v: string) => v,
    [types.TIMESTAMPTZ]: (v: string) => new Date(v).toISOString(),
  };
  const db = new PGlite(dataDir);
  await db.waitReady;

  // PGlite is a single connection, so serialise transactions to mimic a pool.
  let chain: Promise<unknown> = Promise.resolve();

  const run = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params, { parsers })).rows;

  return {
    async query<T>(sql: string, params: unknown[] = []) {
      await chain.catch(() => undefined);
      return run<T>(sql, params);
    },
    tx<T>(fn: (q: Queryable) => Promise<T>) {
      const next = chain.catch(() => undefined).then(() =>
        db.transaction(async (t) => {
          const q: Queryable = {
            async query<R>(sql: string, params: unknown[] = []) {
              return (await t.query<R>(sql, params, { parsers })).rows;
            },
          };
          return fn(q);
        }),
      );
      chain = next;
      return next as Promise<T>;
    },
    async close() {
      await db.close();
    },
  };
}
