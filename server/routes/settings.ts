import { Hono } from 'hono';
import { z } from 'zod';
import type { Database } from '../db/types.js';
import { parse, notFound, conflict } from '../lib/http.js';
import { isoDate, paise, text, optText, uuid } from '../lib/schemas.js';
import { OPENING_BALANCE_SOURCE_ID, audit, clearCategoryCache, deleteLedger, systemCategoryId, upsertLedger } from '../services/ledger.js';

const settingsBody = z.object({
  institution_name: text(120),
  institution_name_kn: text(120),
  donation_title_kn: text(80),
  bill_title_kn: text(80),
  donation_ack_kn: text(400),
  seve_ack_kn: text(400),
  receipt_footer_kn: text(200),
  donation_prefix: text(12),
  seve_prefix: text(12),
  bill_prefix: text(12),
  date_format: z.enum(['DD MMM YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']),
  allow_overpayment: z.boolean(),
  offer_receipt_after_save: z.boolean(),
}).partial();

export function settingsRoutes(db: Database) {
  const app = new Hono();

  app.get('/settings', async (c) => {
    const [s] = await db.query('SELECT * FROM financial_settings WHERE id = 1');
    const [opening] = await db.query(
      `SELECT amount, transaction_date AS date, description FROM transactions WHERE source_type = 'opening_balance'`);
    return c.json({ settings: s, opening_balance: opening ?? null });
  });

  app.put('/settings', async (c) => {
    const body = parse(settingsBody, await c.req.json());
    const keys = Object.keys(body) as (keyof typeof body)[];
    if (!keys.length) return c.json({ ok: true });
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const [s] = await db.query(`UPDATE financial_settings SET ${sets}, updated_at = now() WHERE id = 1 RETURNING *`,
      keys.map((k) => body[k]));
    return c.json({ settings: s });
  });

  // The opening balance is a single ledger row; correcting it updates that row in place.
  app.put('/settings/opening-balance', async (c) => {
    const body = parse(z.object({ amount: paise, date: isoDate, description: optText(200) }), await c.req.json());
    await db.tx(async (q) => {
      const [before] = await q.query(`SELECT * FROM transactions WHERE source_type = 'opening_balance'`);
      await upsertLedger(q, {
        sourceType: 'opening_balance', sourceId: OPENING_BALANCE_SOURCE_ID, amount: body.amount, date: body.date,
        description: body.description ?? 'Opening balance', categoryId: await systemCategoryId(q, 'opening_balance'),
      });
      await audit(q, 'opening_balance', OPENING_BALANCE_SOURCE_ID, before ? 'update' : 'create', before ?? null, body);
    });
    return c.json({ ok: true });
  });

  app.delete('/settings/opening-balance', async (c) => {
    await db.tx(async (q) => {
      const [before] = await q.query(`SELECT * FROM transactions WHERE source_type = 'opening_balance'`);
      if (!before) return;
      await deleteLedger(q, 'opening_balance', OPENING_BALANCE_SOURCE_ID);
      await audit(q, 'opening_balance', OPENING_BALANCE_SOURCE_ID, 'delete', before, null);
    });
    return c.json({ ok: true });
  });

  // ---- Categories ----
  app.get('/categories', async (c) => {
    const rows = await db.query(
      `SELECT c.*, (SELECT COUNT(*)::int FROM expenses x WHERE x.category_id = c.id)
                 + (SELECT COUNT(*)::int FROM incomes i WHERE i.category_id = c.id) AS usage_count
         FROM categories c ORDER BY c.category_type, c.system_key IS NULL, lower(c.name)`);
    return c.json({ items: rows });
  });

  app.post('/categories', async (c) => {
    const body = parse(z.object({ name: text(60), category_type: z.enum(['income', 'expense']) }), await c.req.json());
    const [row] = await db.query(
      `INSERT INTO categories (name, category_type) VALUES ($1, $2)
       ON CONFLICT (category_type, lower(name)) DO UPDATE SET name = categories.name RETURNING *`,
      [body.name, body.category_type]);
    return c.json({ item: row }, 201);
  });

  app.patch('/categories/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const body = parse(z.object({ name: text(60) }), await c.req.json());
    const [row] = await db.query('UPDATE categories SET name = $2 WHERE id = $1 RETURNING *', [id, body.name]);
    if (!row) throw notFound('Category');
    clearCategoryCache();
    return c.json({ item: row });
  });

  app.delete('/categories/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const [cat] = await db.query<{ system_key: string | null }>('SELECT system_key FROM categories WHERE id = $1', [id]);
    if (!cat) throw notFound('Category');
    if (cat.system_key) throw conflict('Built-in categories cannot be deleted');
    const [{ n }] = await db.query<{ n: number }>(
      `SELECT ((SELECT COUNT(*) FROM expenses WHERE category_id = $1) + (SELECT COUNT(*) FROM incomes WHERE category_id = $1))::int AS n`, [id]);
    if (n > 0) throw conflict('This category is used by existing records. Move those records first.');
    await db.query('DELETE FROM categories WHERE id = $1', [id]);
    return c.json({ ok: true });
  });

  return app;
}
