import { Hono } from 'hono';
import { z } from 'zod';
import type { Database, Queryable } from '../db/types.js';
import { parse, notFound, conflict } from '../lib/http.js';
import { isoDate, paise, positivePaise, text, optText, uuid, pageQuery, rangeQuery } from '../lib/schemas.js';
import { audit, deleteLedger, upsertLedger } from '../services/ledger.js';
import { activeReceipt, cancelActiveReceipt, issueReceipt } from '../services/receipts.js';

const eventBody = z.object({ name: text(120), event_date: isoDate, description: optText(1000), notes: optText(1000) });

const expenseFields = {
  title: text(160),
  category_id: uuid,
  amount: positivePaise,
  quantity: optText(40),
  unit_rate: paise.nullish().transform((v) => v ?? null),
  expense_date: isoDate,
  vendor: optText(120),
  description: optText(1000),
  notes: optText(1000),
  event_id: uuid.nullish().transform((v) => v ?? null),
  ritual_entry_id: uuid.nullish().transform((v) => v ?? null),
};
const incomeFields = {
  title: text(160),
  category_id: uuid,
  amount: positivePaise,
  income_date: isoDate,
  received_from: optText(120),
  notes: optText(1000),
  event_id: uuid.nullish().transform((v) => v ?? null),
};

async function syncExpense(q: Queryable, id: string) {
  const [x] = await q.query<Record<string, any>>('SELECT * FROM expenses WHERE id = $1', [id]);
  await upsertLedger(q, {
    sourceType: 'expense', sourceId: x.id, amount: x.amount, date: x.expense_date, description: x.title,
    categoryId: x.category_id, eventId: x.event_id, ritualEntryId: x.ritual_entry_id, partyName: x.vendor, notes: x.notes,
  });
}

async function syncIncome(q: Queryable, id: string) {
  const [x] = await q.query<Record<string, any>>('SELECT * FROM incomes WHERE id = $1', [id]);
  await upsertLedger(q, {
    sourceType: 'other_income', sourceId: x.id, amount: x.amount, date: x.income_date, description: x.title,
    categoryId: x.category_id, eventId: x.event_id, partyName: x.received_from, notes: x.notes,
  });
}

async function assertCategory(q: Queryable, id: string, type: 'income' | 'expense') {
  const [cat] = await q.query<{ category_type: string; system_key: string | null }>('SELECT category_type, system_key FROM categories WHERE id = $1', [id]);
  if (!cat || cat.category_type !== type) throw conflict(`Please choose a valid ${type} category`);
  if (type === 'income' && ['donation', 'ritual_payment', 'opening_balance'].includes(cat.system_key ?? '')) {
    throw conflict('Record donations and seve payments from their own screens');
  }
}

export function eventRoutes(db: Database) {
  const app = new Hono();

  // ---- Events ----
  app.get('/events', async (c) => {
    const search = c.req.query('search')?.trim() || null;
    const items = await db.query(
      `SELECT ev.*,
              COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'expense'), 0)::bigint AS expense_total,
              COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'income'), 0)::bigint AS income_total,
              COUNT(t.id) FILTER (WHERE t.transaction_type = 'expense')::int AS expense_count
         FROM events ev LEFT JOIN transactions t ON t.event_id = ev.id
        WHERE ($1::text IS NULL OR ev.name ILIKE '%' || $1 || '%')
        GROUP BY ev.id ORDER BY ev.event_date DESC, ev.created_at DESC`, [search]);
    return c.json({ items });
  });

  app.get('/events/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const [item] = await db.query('SELECT * FROM events WHERE id = $1', [id]);
    if (!item) throw notFound('Event');
    const expenses = await db.query(
      `SELECT x.*, c.name AS category_name FROM expenses x JOIN categories c ON c.id = x.category_id
        WHERE x.event_id = $1 ORDER BY x.expense_date, x.created_at`, [id]);
    const breakdown = await db.query(
      `SELECT c.name AS category, SUM(x.amount)::bigint AS total, COUNT(*)::int AS count FROM expenses x
         JOIN categories c ON c.id = x.category_id WHERE x.event_id = $1 GROUP BY c.name ORDER BY total DESC`, [id]);
    const income = await db.query(
      `SELECT t.id, t.source_type, t.source_id, t.amount, t.transaction_date, t.description, t.party_name
         FROM transactions t WHERE t.event_id = $1 AND t.transaction_type = 'income' ORDER BY t.transaction_date`, [id]);
    const [totals] = await db.query<{ income: number; expense: number }>(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'income'), 0)::bigint AS income,
              COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'expense'), 0)::bigint AS expense
         FROM transactions WHERE event_id = $1`, [id]);
    const bill = await activeReceipt(db, 'event', id);
    return c.json({ item, expenses, breakdown, income, totals: { ...totals, net: totals.income - totals.expense }, bill });
  });

  app.post('/events', async (c) => {
    const body = parse(eventBody.extend({ id: uuid }), await c.req.json());
    const [item] = await db.query(
      `INSERT INTO events (id, name, event_date, description, notes) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET id = events.id RETURNING *`,
      [body.id, body.name, body.event_date, body.description, body.notes]);
    return c.json({ item }, 201);
  });

  app.put('/events/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const body = parse(eventBody, await c.req.json());
    const [item] = await db.query(
      'UPDATE events SET name=$2, event_date=$3, description=$4, notes=$5, updated_at=now() WHERE id=$1 RETURNING *',
      [id, body.name, body.event_date, body.description, body.notes]);
    if (!item) throw notFound('Event');
    return c.json({ item });
  });

  app.delete('/events/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    await db.tx(async (q) => {
      const [before] = await q.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [id]);
      if (!before) throw notFound('Event');
      // Expenses and income stay in the books; they are just no longer linked to the event.
      await q.query('UPDATE expenses SET event_id = NULL WHERE event_id = $1', [id]);
      await q.query('UPDATE incomes SET event_id = NULL WHERE event_id = $1', [id]);
      await cancelActiveReceipt(q, 'event', id, 'Event was deleted');
      await q.query('DELETE FROM events WHERE id = $1', [id]);
      await audit(q, 'event', id, 'delete', before, null);
    });
    return c.json({ ok: true });
  });

  /** Issue (or re-issue with the latest figures) the internal expense bill for an event. */
  app.post('/events/:id/bill', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const refresh = c.req.query('refresh') === '1';
    const body = parse(z.object({ receipt_number: z.string().max(40).nullish() }), await c.req.json().catch(() => ({})));
    const bill = await db.tx(async (q) => {
      const [ev] = await q.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [id]);
      if (!ev) throw notFound('Event');
      if (refresh) {
        const old = await cancelActiveReceipt(q, 'event', id, 'Replaced by an updated bill');
        return issueReceipt(q, 'expense_bill', id, { receiptNumber: body.receipt_number || old?.receipt_number || '', replacesId: old?.id });
      }
      return issueReceipt(q, 'expense_bill', id, { receiptNumber: body.receipt_number ?? '' });
    });
    return c.json({ receipt: bill });
  });

  // ---- Expenses ----
  app.get('/expenses', async (c) => {
    const { page, pageSize } = parse(pageQuery, c.req.query());
    const { from, to } = parse(rangeQuery, c.req.query());
    const q = c.req.query();
    const where = `($1::date IS NULL OR x.expense_date >= $1) AND ($2::date IS NULL OR x.expense_date <= $2)
      AND ($3::uuid IS NULL OR x.event_id = $3) AND ($4::uuid IS NULL OR x.category_id = $4)
      AND ($5::text IS NULL OR x.title ILIKE '%' || $5 || '%' OR x.vendor ILIKE '%' || $5 || '%' OR ev.name ILIKE '%' || $5 || '%')`;
    const params = [from ?? null, to ?? null, q.event_id || null, q.category_id || null, q.search?.trim() || null];
    const items = await db.query(
      `SELECT x.*, c.name AS category_name, ev.name AS event_name FROM expenses x
         JOIN categories c ON c.id = x.category_id LEFT JOIN events ev ON ev.id = x.event_id
        WHERE ${where} ORDER BY x.expense_date DESC, x.created_at DESC LIMIT $6 OFFSET $7`,
      [...params, pageSize, (page - 1) * pageSize]);
    const [summary] = await db.query(
      `SELECT COALESCE(SUM(x.amount), 0)::bigint AS total, COUNT(*)::int AS count FROM expenses x
         LEFT JOIN events ev ON ev.id = x.event_id WHERE ${where}`, params);
    return c.json({ items, summary, page, pageSize });
  });

  app.get('/expenses/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const [item] = await db.query(
      `SELECT x.*, c.name AS category_name, ev.name AS event_name FROM expenses x
         JOIN categories c ON c.id = x.category_id LEFT JOIN events ev ON ev.id = x.event_id WHERE x.id = $1`, [id]);
    if (!item) throw notFound('Expense');
    return c.json({ item });
  });

  app.post('/expenses', async (c) => {
    const body = parse(z.object({ id: uuid, ...expenseFields }), await c.req.json());
    const result = await db.tx(async (q) => {
      await assertCategory(q, body.category_id, 'expense');
      const inserted = await q.query<Record<string, any>>(
        `INSERT INTO expenses (id, title, category_id, amount, quantity, unit_rate, expense_date, vendor, description, notes, event_id, ritual_entry_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING RETURNING *`,
        [body.id, body.title, body.category_id, body.amount, body.quantity, body.unit_rate, body.expense_date, body.vendor,
          body.description, body.notes, body.event_id, body.ritual_entry_id]);
      if (!inserted[0]) return { item: (await q.query('SELECT * FROM expenses WHERE id = $1', [body.id]))[0], duplicate: true };
      await syncExpense(q, body.id);
      await audit(q, 'expense', body.id, 'create', null, inserted[0]);
      return { item: inserted[0], duplicate: false };
    });
    return c.json(result, result.duplicate ? 200 : 201);
  });

  app.put('/expenses/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const body = parse(z.object(expenseFields), await c.req.json());
    const item = await db.tx(async (q) => {
      const [before] = await q.query('SELECT * FROM expenses WHERE id = $1 FOR UPDATE', [id]);
      if (!before) throw notFound('Expense');
      await assertCategory(q, body.category_id, 'expense');
      const [after] = await q.query(
        `UPDATE expenses SET title=$2, category_id=$3, amount=$4, quantity=$5, unit_rate=$6, expense_date=$7, vendor=$8,
           description=$9, notes=$10, event_id=$11, ritual_entry_id=$12, updated_at=now() WHERE id=$1 RETURNING *`,
        [id, body.title, body.category_id, body.amount, body.quantity, body.unit_rate, body.expense_date, body.vendor,
          body.description, body.notes, body.event_id, body.ritual_entry_id]);
      await syncExpense(q, id);
      await audit(q, 'expense', id, 'update', before, after);
      return after;
    });
    return c.json({ item });
  });

  app.delete('/expenses/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    await db.tx(async (q) => {
      const [before] = await q.query('SELECT * FROM expenses WHERE id = $1 FOR UPDATE', [id]);
      if (!before) throw notFound('Expense');
      await deleteLedger(q, 'expense', id);
      await q.query('DELETE FROM expenses WHERE id = $1', [id]);
      await audit(q, 'expense', id, 'delete', before, null);
    });
    return c.json({ ok: true });
  });

  // ---- Other income ----
  app.get('/incomes/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const [item] = await db.query(
      `SELECT i.*, c.name AS category_name, ev.name AS event_name FROM incomes i
         JOIN categories c ON c.id = i.category_id LEFT JOIN events ev ON ev.id = i.event_id WHERE i.id = $1`, [id]);
    if (!item) throw notFound('Income');
    return c.json({ item });
  });

  app.post('/incomes', async (c) => {
    const body = parse(z.object({ id: uuid, ...incomeFields }), await c.req.json());
    const result = await db.tx(async (q) => {
      await assertCategory(q, body.category_id, 'income');
      const inserted = await q.query<Record<string, any>>(
        `INSERT INTO incomes (id, title, category_id, amount, income_date, received_from, notes, event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING RETURNING *`,
        [body.id, body.title, body.category_id, body.amount, body.income_date, body.received_from, body.notes, body.event_id]);
      if (!inserted[0]) return { item: (await q.query('SELECT * FROM incomes WHERE id = $1', [body.id]))[0], duplicate: true };
      await syncIncome(q, body.id);
      await audit(q, 'income', body.id, 'create', null, inserted[0]);
      return { item: inserted[0], duplicate: false };
    });
    return c.json(result, result.duplicate ? 200 : 201);
  });

  app.put('/incomes/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const body = parse(z.object(incomeFields), await c.req.json());
    const item = await db.tx(async (q) => {
      const [before] = await q.query('SELECT * FROM incomes WHERE id = $1 FOR UPDATE', [id]);
      if (!before) throw notFound('Income');
      await assertCategory(q, body.category_id, 'income');
      const [after] = await q.query(
        `UPDATE incomes SET title=$2, category_id=$3, amount=$4, income_date=$5, received_from=$6, notes=$7, event_id=$8,
           updated_at=now() WHERE id=$1 RETURNING *`,
        [id, body.title, body.category_id, body.amount, body.income_date, body.received_from, body.notes, body.event_id]);
      await syncIncome(q, id);
      await audit(q, 'income', id, 'update', before, after);
      return after;
    });
    return c.json({ item });
  });

  app.delete('/incomes/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    await db.tx(async (q) => {
      const [before] = await q.query('SELECT * FROM incomes WHERE id = $1 FOR UPDATE', [id]);
      if (!before) throw notFound('Income');
      await deleteLedger(q, 'other_income', id);
      await q.query('DELETE FROM incomes WHERE id = $1', [id]);
      await audit(q, 'income', id, 'delete', before, null);
    });
    return c.json({ ok: true });
  });

  return app;
}
