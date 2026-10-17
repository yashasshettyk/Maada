import { Hono } from 'hono';
import { z } from 'zod';
import type { Database, Queryable } from '../db/types.js';
import { parse, notFound, conflict, invalid } from '../lib/http.js';
import { isoDate, paise, positivePaise, text, optText, uuid, pageQuery } from '../lib/schemas.js';
import { audit, deleteLedger, systemCategoryId, upsertLedger } from '../services/ledger.js';
import { activeReceipt, cancelActiveReceipt, issueReceipt, reissueIfIssued } from '../services/receipts.js';
import { formatINR } from '../../shared/money.js';

const ritualBody = z.object({
  name: text(120),
  receipt_title: optText(120),
  default_amount: paise.nullish().transform((v) => v ?? null),
  description: optText(1000),
});

const entryFields = {
  ritual_id: uuid,
  devotee_name: text(120),
  contact: optText(80),
  ritual_date: isoDate,
  prescribed_amount: paise,
  notes: optText(1000),
  event_id: uuid.nullish().transform((v) => v ?? null),
};
const paymentFields = {
  amount: positivePaise,
  payment_date: isoDate,
  payment_method: optText(40),
  reference_number: optText(80),
  notes: optText(1000),
};
const entryCreate = z.object({
  id: uuid,
  ...entryFields,
  initial_payment: z.object({ id: uuid, ...paymentFields }).nullish(),
  issue_receipt: z.boolean().optional(),
});
const paymentCreate = z.object({ id: uuid, ...paymentFields, issue_receipt: z.boolean().optional() });

export const ENTRY_SELECT = `
  SELECT e.*, r.name AS ritual_name, r.receipt_title, ev.name AS event_name,
         COALESCE(p.paid, 0)::bigint AS paid,
         GREATEST(e.prescribed_amount - COALESCE(p.paid, 0), 0)::bigint AS pending,
         CASE WHEN COALESCE(p.paid, 0) = 0 AND e.prescribed_amount > 0 THEN 'pending'
              WHEN COALESCE(p.paid, 0) < e.prescribed_amount THEN 'partial'
              WHEN COALESCE(p.paid, 0) = e.prescribed_amount THEN 'paid'
              ELSE 'overpaid' END AS status
    FROM ritual_entries e
    JOIN rituals r ON r.id = e.ritual_id
    LEFT JOIN events ev ON ev.id = e.event_id
    LEFT JOIN (SELECT ritual_entry_id, SUM(amount) AS paid FROM ritual_payments GROUP BY ritual_entry_id) p ON p.ritual_entry_id = e.id`;

async function syncPaymentLedger(q: Queryable, paymentId: string) {
  const [p] = await q.query<Record<string, any>>(
    `SELECT p.*, e.devotee_name, e.event_id, r.name AS ritual_name FROM ritual_payments p
       JOIN ritual_entries e ON e.id = p.ritual_entry_id JOIN rituals r ON r.id = e.ritual_id WHERE p.id = $1`, [paymentId]);
  await upsertLedger(q, {
    sourceType: 'ritual_payment', sourceId: p.id, amount: p.amount, date: p.payment_date,
    description: `${p.ritual_name} · ${p.devotee_name}`, categoryId: await systemCategoryId(q, 'ritual_payment'),
    eventId: p.event_id, ritualEntryId: p.ritual_entry_id, partyName: p.devotee_name, notes: p.notes,
  });
}

/** Refuse a payment that would take an entry past its prescribed amount, unless settings allow it. */
async function assertNoOverpayment(q: Queryable, entryId: string, extra: number, excludePaymentId?: string) {
  const [{ allow_overpayment }] = await q.query<{ allow_overpayment: boolean }>('SELECT allow_overpayment FROM financial_settings WHERE id = 1');
  if (allow_overpayment) return;
  const [row] = await q.query<{ prescribed_amount: number; paid: number }>(
    `SELECT e.prescribed_amount, COALESCE((SELECT SUM(amount) FROM ritual_payments
        WHERE ritual_entry_id = e.id AND ($2::uuid IS NULL OR id <> $2)), 0)::bigint AS paid
       FROM ritual_entries e WHERE e.id = $1`, [entryId, excludePaymentId ?? null]);
  if (row.paid + extra > row.prescribed_amount) {
    const left = Math.max(row.prescribed_amount - row.paid, 0);
    throw invalid(`This payment is more than the balance due (${formatINR(left)}).`, { pending: left });
  }
}

async function insertPayment(q: Queryable, entryId: string, p: z.infer<typeof paymentCreate> | NonNullable<z.infer<typeof entryCreate>['initial_payment']>) {
  // Lock the entry so concurrent payments are checked one after another.
  await q.query('SELECT id FROM ritual_entries WHERE id = $1 FOR UPDATE', [entryId]);
  const [dup] = await q.query<Record<string, any>>('SELECT * FROM ritual_payments WHERE id = $1', [p.id]);
  if (dup) return { payment: dup, duplicate: true };
  await assertNoOverpayment(q, entryId, p.amount);
  const [payment] = await q.query<Record<string, any>>(
    `INSERT INTO ritual_payments (id, ritual_entry_id, amount, payment_date, payment_method, reference_number, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [p.id, entryId, p.amount, p.payment_date, p.payment_method, p.reference_number, p.notes]);
  await syncPaymentLedger(q, payment.id);
  await audit(q, 'ritual_payment', payment.id, 'create', null, payment);
  return { payment, duplicate: false };
}

export function ritualRoutes(db: Database) {
  const app = new Hono();

  // ---- Seve / ritual types ----
  app.get('/rituals', async (c) => {
    const items = await db.query(
      `SELECT r.*, COUNT(e.id)::int AS entry_count FROM rituals r LEFT JOIN ritual_entries e ON e.ritual_id = r.id
        GROUP BY r.id ORDER BY lower(r.name)`);
    return c.json({ items });
  });

  app.post('/rituals', async (c) => {
    const body = parse(ritualBody, await c.req.json());
    const [dupe] = await db.query('SELECT id FROM rituals WHERE lower(name) = lower($1)', [body.name]);
    if (dupe) throw conflict('A seve with this name already exists');
    const [item] = await db.query(
      'INSERT INTO rituals (name, receipt_title, default_amount, description) VALUES ($1,$2,$3,$4) RETURNING *',
      [body.name, body.receipt_title, body.default_amount, body.description]);
    return c.json({ item }, 201);
  });

  app.put('/rituals/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const body = parse(ritualBody, await c.req.json());
    const [item] = await db.query(
      `UPDATE rituals SET name=$2, receipt_title=$3, default_amount=$4, description=$5, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, body.name, body.receipt_title, body.default_amount, body.description]);
    if (!item) throw notFound('Seve');
    return c.json({ item });
  });

  app.delete('/rituals/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const [{ n }] = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM ritual_entries WHERE ritual_id = $1', [id]);
    if (n > 0) throw conflict('This seve has entries recorded against it and cannot be deleted.');
    await db.query('DELETE FROM rituals WHERE id = $1', [id]);
    return c.json({ ok: true });
  });

  // ---- Entries ----
  app.get('/ritual-entries', async (c) => {
    const { page, pageSize } = parse(pageQuery, c.req.query());
    const q = c.req.query();
    const sort = ({ date_asc: 'x.ritual_date ASC', pending: 'x.pending DESC', name: 'lower(x.devotee_name)' } as Record<string, string>)[q.sort ?? ''] ?? 'x.ritual_date DESC, x.created_at DESC';
    const where = `WHERE ($1::text IS NULL OR e.devotee_name ILIKE '%' || $1 || '%' OR r.name ILIKE '%' || $1 || '%' OR r.receipt_title ILIKE '%' || $1 || '%')
      AND ($2::uuid IS NULL OR e.ritual_id = $2) AND ($3::date IS NULL OR e.ritual_date >= $3) AND ($4::date IS NULL OR e.ritual_date <= $4)`;
    const params = [q.search?.trim() || null, q.ritual_id || null, q.from || null, q.to || null];
    const status = ['pending', 'partial', 'paid', 'overpaid'].includes(q.status ?? '') ? q.status : null;
    const rows = await db.query(
      `SELECT * FROM (${ENTRY_SELECT} ${where}) x WHERE ($5::text IS NULL OR x.status = $5)
        ORDER BY ${sort} LIMIT $6 OFFSET $7`,
      [...params, status, pageSize, (page - 1) * pageSize]);
    const [summary] = await db.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(pending), 0)::bigint AS pending, COALESCE(SUM(paid), 0)::bigint AS paid
         FROM (${ENTRY_SELECT} ${where}) x WHERE ($5::text IS NULL OR x.status = $5)`, [...params, status]);
    return c.json({ items: rows, summary, page, pageSize });
  });

  app.get('/ritual-entries/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const [item] = await db.query(`${ENTRY_SELECT} WHERE e.id = $1`, [id]);
    if (!item) throw notFound('Ritual entry');
    const payments = await db.query(
      `SELECT p.*, r.id AS receipt_id, r.receipt_number FROM ritual_payments p
         LEFT JOIN receipts r ON r.source_type = 'ritual_payment' AND r.source_id = p.id AND r.status = 'issued'
        WHERE p.ritual_entry_id = $1 ORDER BY p.payment_date, p.created_at`, [id]);
    const expenses = await db.query(
      `SELECT x.*, c.name AS category_name FROM expenses x JOIN categories c ON c.id = x.category_id
        WHERE x.ritual_entry_id = $1 ORDER BY x.expense_date`, [id]);
    const receipts = await db.query(
      `SELECT r.id, r.receipt_number, r.status, r.issue_date, r.cancel_reason, r.source_id FROM receipts r
        WHERE r.source_type = 'ritual_payment' AND r.source_id IN (SELECT id FROM ritual_payments WHERE ritual_entry_id = $1)
        ORDER BY r.created_at DESC`, [id]);
    return c.json({ item, payments, expenses, receipts });
  });

  app.post('/ritual-entries', async (c) => {
    const body = parse(entryCreate, await c.req.json());
    const result = await db.tx(async (q) => {
      const inserted = await q.query<Record<string, any>>(
        `INSERT INTO ritual_entries (id, ritual_id, devotee_name, contact, ritual_date, prescribed_amount, notes, event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING RETURNING *`,
        [body.id, body.ritual_id, body.devotee_name, body.contact, body.ritual_date, body.prescribed_amount, body.notes, body.event_id]);
      let receipt = null;
      let payment = null;
      if (inserted[0]) await audit(q, 'ritual_entry', body.id, 'create', null, inserted[0]);
      if (body.initial_payment) {
        payment = (await insertPayment(q, body.id, body.initial_payment)).payment;
        if (body.issue_receipt) receipt = await issueReceipt(q, 'ritual_payment', payment.id);
        else receipt = await activeReceipt(q, 'ritual_payment', payment.id);
      }
      const [item] = await q.query(`${ENTRY_SELECT} WHERE e.id = $1`, [body.id]);
      return { item, payment, receipt, duplicate: !inserted[0] };
    });
    return c.json(result, result.duplicate ? 200 : 201);
  });

  app.put('/ritual-entries/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const body = parse(z.object(entryFields), await c.req.json());
    const result = await db.tx(async (q) => {
      const [before] = await q.query<Record<string, any>>('SELECT * FROM ritual_entries WHERE id = $1 FOR UPDATE', [id]);
      if (!before) throw notFound('Ritual entry');
      const [{ paid }] = await q.query<{ paid: number }>(
        'SELECT COALESCE(SUM(amount), 0)::bigint AS paid FROM ritual_payments WHERE ritual_entry_id = $1', [id]);
      const [{ allow_overpayment }] = await q.query<{ allow_overpayment: boolean }>('SELECT allow_overpayment FROM financial_settings WHERE id = 1');
      if (!allow_overpayment && body.prescribed_amount < paid) {
        throw invalid(`The amount cannot be less than what has already been paid (${formatINR(paid)}).`);
      }
      const [after] = await q.query(
        `UPDATE ritual_entries SET ritual_id=$2, devotee_name=$3, contact=$4, ritual_date=$5, prescribed_amount=$6, notes=$7,
           event_id=$8, updated_at=now() WHERE id=$1 RETURNING *`,
        [id, body.ritual_id, body.devotee_name, body.contact, body.ritual_date, body.prescribed_amount, body.notes, body.event_id]);
      const payments = await q.query<{ id: string }>('SELECT id FROM ritual_payments WHERE ritual_entry_id = $1', [id]);
      for (const p of payments) await syncPaymentLedger(q, p.id);
      await audit(q, 'ritual_entry', id, 'update', before, after);
      const [item] = await q.query(`${ENTRY_SELECT} WHERE e.id = $1`, [id]);
      return { item };
    });
    return c.json(result);
  });

  app.delete('/ritual-entries/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    await db.tx(async (q) => {
      const [before] = await q.query('SELECT * FROM ritual_entries WHERE id = $1 FOR UPDATE', [id]);
      if (!before) throw notFound('Ritual entry');
      const payments = await q.query<{ id: string }>('SELECT id FROM ritual_payments WHERE ritual_entry_id = $1', [id]);
      for (const p of payments) {
        await cancelActiveReceipt(q, 'ritual_payment', p.id, 'Seve entry was deleted');
        await deleteLedger(q, 'ritual_payment', p.id);
      }
      await q.query('DELETE FROM ritual_entries WHERE id = $1', [id]);
      await audit(q, 'ritual_entry', id, 'delete', before, null);
    });
    return c.json({ ok: true });
  });

  // ---- Payments ----
  app.post('/ritual-entries/:id/payments', async (c) => {
    const entryId = parse(uuid, c.req.param('id'));
    const body = parse(paymentCreate, await c.req.json());
    const result = await db.tx(async (q) => {
      const [entry] = await q.query('SELECT id FROM ritual_entries WHERE id = $1', [entryId]);
      if (!entry) throw notFound('Ritual entry');
      const { payment, duplicate } = await insertPayment(q, entryId, body);
      const receipt = body.issue_receipt ? await issueReceipt(q, 'ritual_payment', payment.id) : await activeReceipt(q, 'ritual_payment', payment.id);
      return { payment, receipt, duplicate };
    });
    return c.json(result, result.duplicate ? 200 : 201);
  });

  app.put('/ritual-payments/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const body = parse(z.object(paymentFields), await c.req.json());
    const result = await db.tx(async (q) => {
      const [before] = await q.query<Record<string, any>>('SELECT * FROM ritual_payments WHERE id = $1', [id]);
      if (!before) throw notFound('Payment');
      await q.query('SELECT id FROM ritual_entries WHERE id = $1 FOR UPDATE', [before.ritual_entry_id]);
      await assertNoOverpayment(q, before.ritual_entry_id, body.amount, id);
      const [payment] = await q.query<Record<string, any>>(
        `UPDATE ritual_payments SET amount=$2, payment_date=$3, payment_method=$4, reference_number=$5, notes=$6, updated_at=now()
          WHERE id=$1 RETURNING *`, [id, body.amount, body.payment_date, body.payment_method, body.reference_number, body.notes]);
      await syncPaymentLedger(q, id);
      await audit(q, 'ritual_payment', id, 'update', before, payment);
      const changed = before.amount !== payment.amount || before.payment_date !== payment.payment_date;
      const receipt = changed ? await reissueIfIssued(q, 'ritual_payment', id, 'Payment details were corrected') : await activeReceipt(q, 'ritual_payment', id);
      return { payment, receipt };
    });
    return c.json(result);
  });

  app.delete('/ritual-payments/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    await db.tx(async (q) => {
      const [before] = await q.query('SELECT * FROM ritual_payments WHERE id = $1', [id]);
      if (!before) throw notFound('Payment');
      await cancelActiveReceipt(q, 'ritual_payment', id, 'Payment was deleted');
      await deleteLedger(q, 'ritual_payment', id);
      await q.query('DELETE FROM ritual_payments WHERE id = $1', [id]);
      await audit(q, 'ritual_payment', id, 'delete', before, null);
    });
    return c.json({ ok: true });
  });

  return app;
}
