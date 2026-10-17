import { Hono } from 'hono';
import { z } from 'zod';
import type { Database, Queryable } from '../db/types.js';
import { parse, notFound } from '../lib/http.js';
import { isoDate, positivePaise, text, optText, uuid, pageQuery, rangeQuery } from '../lib/schemas.js';
import { audit, deleteLedger, systemCategoryId, upsertLedger } from '../services/ledger.js';
import { activeReceipt, cancelActiveReceipt, issueReceipt, reissueIfIssued } from '../services/receipts.js';

const fields = {
  donor_name: text(120),
  donation_date: isoDate,
  amount: positivePaise,
  purpose: text(200),
  payment_method: optText(40),
  reference_number: optText(80),
  notes: optText(1000),
  event_id: uuid.nullish().transform((v) => v ?? null),
};
const createBody = z.object({ id: uuid, ...fields, issue_receipt: z.boolean().optional(), receipt_number: z.string().max(40).nullish() });
const updateBody = z.object(fields);

async function syncLedger(q: Queryable, d: Record<string, any>) {
  await upsertLedger(q, {
    sourceType: 'donation', sourceId: d.id, amount: d.amount, date: d.donation_date,
    description: `Donation · ${d.donor_name}`, categoryId: await systemCategoryId(q, 'donation'),
    eventId: d.event_id, partyName: d.donor_name, notes: d.purpose,
  });
}

export function donationRoutes(db: Database) {
  const app = new Hono();

  app.get('/donations', async (c) => {
    const { page, pageSize } = parse(pageQuery, c.req.query());
    const { from, to } = parse(rangeQuery, c.req.query());
    const search = c.req.query('search')?.trim() || null;
    const purpose = c.req.query('purpose')?.trim() || null;
    const where = `($1::date IS NULL OR d.donation_date >= $1) AND ($2::date IS NULL OR d.donation_date <= $2)
      AND ($3::text IS NULL OR d.donor_name ILIKE '%' || $3 || '%' OR d.purpose ILIKE '%' || $3 || '%')
      AND ($4::text IS NULL OR d.purpose ILIKE $4)`;
    const params = [from ?? null, to ?? null, search, purpose];
    const items = await db.query(
      `SELECT d.*, r.id AS receipt_id, r.receipt_number
         FROM donations d LEFT JOIN receipts r ON r.source_type = 'donation' AND r.source_id = d.id AND r.status = 'issued'
        WHERE ${where} ORDER BY d.donation_date DESC, d.created_at DESC LIMIT $5 OFFSET $6`,
      [...params, pageSize, (page - 1) * pageSize]);
    const [{ total, count }] = await db.query<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS total, COUNT(*)::int AS count FROM donations d WHERE ${where}`, params);
    return c.json({ items, total, count, page, pageSize });
  });

  app.get('/donations/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const [item] = await db.query(
      `SELECT d.*, e.name AS event_name FROM donations d LEFT JOIN events e ON e.id = d.event_id WHERE d.id = $1`, [id]);
    if (!item) throw notFound('Donation');
    const receipts = await db.query(
      `SELECT id, receipt_number, status, issue_date, cancel_reason, created_at FROM receipts
        WHERE source_type = 'donation' AND source_id = $1 ORDER BY created_at DESC`, [id]);
    return c.json({ item, receipts });
  });

  app.post('/donations', async (c) => {
    const body = parse(createBody, await c.req.json());
    const result = await db.tx(async (q) => {
      const inserted = await q.query<Record<string, any>>(
        `INSERT INTO donations (id, donor_name, donation_date, amount, purpose, payment_method, reference_number, notes, event_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING RETURNING *`,
        [body.id, body.donor_name, body.donation_date, body.amount, body.purpose, body.payment_method,
          body.reference_number, body.notes, body.event_id]);
      if (!inserted[0]) {
        // Repeated submission of the same form: return what was already saved.
        const [existing] = await q.query('SELECT * FROM donations WHERE id = $1', [body.id]);
        return { item: existing, receipt: await activeReceipt(q, 'donation', body.id), duplicate: true };
      }
      const d = inserted[0];
      await syncLedger(q, d);
      await audit(q, 'donation', d.id, 'create', null, d);
      const receipt = body.issue_receipt ? await issueReceipt(q, 'donation', d.id, { receiptNumber: body.receipt_number ?? '' }) : null;
      return { item: d, receipt, duplicate: false };
    });
    return c.json(result, result.duplicate ? 200 : 201);
  });

  app.put('/donations/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const body = parse(updateBody, await c.req.json());
    const result = await db.tx(async (q) => {
      const [before] = await q.query<Record<string, any>>('SELECT * FROM donations WHERE id = $1 FOR UPDATE', [id]);
      if (!before) throw notFound('Donation');
      const [d] = await q.query<Record<string, any>>(
        `UPDATE donations SET donor_name=$2, donation_date=$3, amount=$4, purpose=$5, payment_method=$6,
           reference_number=$7, notes=$8, event_id=$9, updated_at=now() WHERE id=$1 RETURNING *`,
        [id, body.donor_name, body.donation_date, body.amount, body.purpose, body.payment_method, body.reference_number, body.notes, body.event_id]);
      await syncLedger(q, d);
      await audit(q, 'donation', id, 'update', before, d);
      const changed = ['donor_name', 'donation_date', 'amount', 'purpose'].some((k) => String(before[k]) !== String(d[k]));
      const receipt = changed ? await reissueIfIssued(q, 'donation', id, 'Donation details were corrected') : await activeReceipt(q, 'donation', id);
      return { item: d, receipt };
    });
    return c.json(result);
  });

  app.delete('/donations/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    await db.tx(async (q) => {
      const [before] = await q.query('SELECT * FROM donations WHERE id = $1 FOR UPDATE', [id]);
      if (!before) throw notFound('Donation');
      await cancelActiveReceipt(q, 'donation', id, 'Donation was deleted');
      await deleteLedger(q, 'donation', id);
      await q.query('DELETE FROM donations WHERE id = $1', [id]);
      await audit(q, 'donation', id, 'delete', before, null);
    });
    return c.json({ ok: true });
  });

  return app;
}
