import pg from 'pg';
import type { Database, Queryable } from './types.js';

// Return BIGINT (paise) as JS numbers (amounts are bounded well within 2^53),
// and DATE as the raw 'YYYY-MM-DD' string so no timezone shifting can occur.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());

export function createPgDatabase(connectionString: string): Database {
  const pool = new pg.Pool({
    connectionString,
    // Serverless functions should hold very few connections; use the provider's pooler URL.
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: /sslmode=disable/.test(connectionString) || /localhost|127\.0\.0\.1/.test(connectionString)
      ? undefined
      : { rejectUnauthorized: process.env.DATABASE_SSL_NO_VERIFY !== 'true' },
  });

  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    },
    async tx<T>(fn: (q: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const q: Queryable = {
          async query<R>(sql: string, params: unknown[] = []) {
            const res = await client.query(sql, params);
            return res.rows as R[];
          },
        };
        const result = await fn(q);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
