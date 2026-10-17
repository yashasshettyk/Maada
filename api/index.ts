import { createApp, optionsFromEnv } from '../server/app.js';
import { createPgDatabase } from '../server/db/pg.js';
import { migrate } from '../server/db/migrate.js';

// Vercel serverless entry point. Module state survives between warm invocations,
// so the connection pool and migration check happen once per instance.
const url = process.env.DATABASE_URL;
const db = url ? createPgDatabase(url) : null;
const app = db ? createApp(db, optionsFromEnv()) : null;
let ready: Promise<unknown> | null = null;

async function handle(req: Request): Promise<Response> {
  if (!db || !app) {
    return Response.json({ error: { code: 'not_configured', message: 'DATABASE_URL is not set on the server.' } }, { status: 500 });
  }
  if (process.env.AUTO_MIGRATE !== 'false') {
    ready ??= migrate(db).catch((err) => { ready = null; throw err; });
    await ready;
  }
  return app.fetch(req);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
