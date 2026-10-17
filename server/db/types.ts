/** Minimal database interface shared by the production (node-postgres) and the
 * embedded (PGlite) drivers, so business logic and tests run on real Postgres. */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Queryable {
  /** Run `fn` inside a single database transaction. Any thrown error rolls back. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
