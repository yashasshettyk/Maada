import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from './types.js';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');

/** Apply any pending SQL migrations in filename order, each inside its own transaction. */
export async function migrate(db: Database, log: (msg: string) => void = () => undefined): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied = new Set((await db.query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const didRun = await db.tx(async (q) => {
      // Serialise concurrent cold starts: only one instance applies a migration.
      await q.query('SELECT pg_advisory_xact_lock(727274)');
      const done = await q.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (done.length) return false;
      for (const statement of splitSql(sql)) await q.query(statement);
      await q.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      return true;
    });
    if (didRun) {
      log(`applied ${file}`);
      ran.push(file);
    }
  }
  return ran;
}

/** Split a migration file on semicolons that end a statement (no procedural bodies are used). */
export function splitSql(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}
