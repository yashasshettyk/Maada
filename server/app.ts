import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { timingSafeEqual } from 'node:crypto';
import type { Database } from './db/types.js';
import { ApiError, fromDbError } from './lib/http.js';
import { settingsRoutes } from './routes/settings.js';
import { donationRoutes } from './routes/donations.js';
import { ritualRoutes } from './routes/rituals.js';
import { eventRoutes } from './routes/events.js';
import { ledgerRoutes } from './routes/ledger.js';
import { adminRoutes } from './routes/admin.js';
import { seedDemo } from './services/demo.js';

export interface AppOptions {
  /** When set, every API request must send this value in the x-maada-key header. */
  apiKey?: string;
  /** Extra browser origins allowed to call the API (the Android app's origins are always allowed). */
  allowedOrigins?: string[];
  /** Maximum write requests per client per minute. 0 disables the limit. */
  writeRateLimit?: number;
}

const APP_ORIGINS = ['https://localhost', 'http://localhost', 'capacitor://localhost', 'http://localhost:5173', 'http://127.0.0.1:5173'];

function keysMatch(given: string | undefined, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp(db: Database, opts: AppOptions = {}) {
  const app = new Hono();
  const origins = new Set([...APP_ORIGINS, ...(opts.allowedOrigins ?? [])]);
  const limit = opts.writeRateLimit ?? 120;

  app.use('*', secureHeaders());
  app.use('/api/*', cors({
    origin: (origin) => (origins.has(origin) ? origin : null),
    allowHeaders: ['content-type', 'x-maada-key', 'x-confirm-restore', 'x-confirm-erase'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  }));

  app.get('/api/health', async (c) => {
    await db.query('SELECT 1');
    return c.json({ ok: true, time: new Date().toISOString() });
  });

  app.use('/api/*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    if (opts.apiKey && !keysMatch(c.req.header('x-maada-key'), opts.apiKey)) {
      throw new ApiError(401, 'unauthorized', 'This app is not authorised to use the server. Check the access key.');
    }
    if (limit > 0 && c.req.method !== 'GET') {
      const ip = (c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'local').split(',')[0].trim();
      const [{ hits }] = await db.query<{ hits: number }>(
        `INSERT INTO rate_limits (bucket, window_start) VALUES ($1, date_trunc('minute', now()))
         ON CONFLICT (bucket, window_start) DO UPDATE SET hits = rate_limits.hits + 1 RETURNING hits`, [ip]);
      if (hits > limit) throw new ApiError(429, 'rate_limited', 'Too many changes in a short time. Please wait a minute.');
      if (Math.random() < 0.02) await db.query(`DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour'`);
    }
    return next();
  });

  app.use('/api/backup/*', bodyLimit({ maxSize: 25 * 1024 * 1024, onError: () => { throw new ApiError(413, 'too_large', 'File is too large'); } }));
  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/backup')) return next();
    return bodyLimit({ maxSize: 256 * 1024, onError: () => { throw new ApiError(413, 'too_large', 'Request is too large'); } })(c, next);
  });

  const api = new Hono();
  api.route('/', settingsRoutes(db));
  api.route('/', donationRoutes(db));
  api.route('/', ritualRoutes(db));
  api.route('/', eventRoutes(db));
  api.route('/', ledgerRoutes(db));
  api.route('/', adminRoutes(db));
  api.post('/admin/demo-data', async (c) => {
    const ids = await seedDemo(app, db, opts.apiKey ? { 'x-maada-key': opts.apiKey } : {});
    return c.json({ ok: true, ids }, 201);
  });
  app.route('/api', api);

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));
  app.onError((err, c) => {
    const e = err instanceof ApiError ? err : fromDbError(err);
    if (e) return c.json({ error: { code: e.code, message: e.message, details: e.details } }, e.status);
    if (err instanceof SyntaxError) return c.json({ error: { code: 'bad_json', message: 'Request body is not valid JSON' } }, 400);
    console.error(err);
    return c.json({ error: { code: 'server_error', message: 'Something went wrong on the server. Nothing was saved.' } }, 500);
  });

  return app;
}

export function optionsFromEnv(env: NodeJS.ProcessEnv = process.env): AppOptions {
  return {
    apiKey: env.MAADA_API_KEY || undefined,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    writeRateLimit: env.WRITE_RATE_LIMIT ? Number(env.WRITE_RATE_LIMIT) : undefined,
  };
}
