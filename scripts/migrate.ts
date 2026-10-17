import { createPgDatabase } from '../server/db/pg.js';
import { migrate } from '../server/db/migrate.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in, or export it.');
  process.exit(1);
}
const db = createPgDatabase(url);
try {
  const ran = await migrate(db, (m) => console.log(m));
  console.log(ran.length ? `Done. ${ran.length} migration(s) applied.` : 'Database is up to date.');
} finally {
  await db.close();
}
