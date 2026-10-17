import { serve } from '@hono/node-server';
import { createApp, optionsFromEnv } from './app.js';
import { migrate } from './db/migrate.js';
import type { Database } from './db/types.js';

// Local development server. Uses DATABASE_URL when set, otherwise an embedded
// Postgres (PGlite) stored in .data/ so no database install is needed.
const port = Number(process.env.API_PORT ?? 3001);
let db: Database;
if (process.env.DATABASE_URL) {
  const { createPgDatabase } = await import('./db/pg.js');
  db = createPgDatabase(process.env.DATABASE_URL);
} else {
  const { createPgliteDatabase } = await import('./db/pglite.js');
  const dir = process.env.PGLITE_DIR ?? '.data/pglite';
  db = await createPgliteDatabase(dir);
  console.log(`Using embedded database in ${dir} (set DATABASE_URL to use Postgres)`);
}
await migrate(db, (m) => console.log(m));
const app = createApp(db, optionsFromEnv());
serve({ fetch: app.fetch, port }, () => console.log(`API ready on http://localhost:${port}`));
