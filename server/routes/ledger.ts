import { Hono } from 'hono';
import { z } from 'zod';
import type { Database } from '../db/types.js';
import { parse, notFound, conflict } from '../lib/http.js';
import { isoDate, pageQuery, rangeQuery, text, uuid } from '../lib/schemas.js';
import { currentBalance } from '../services/ledger.js';
import { audit } from '../services/ledger.js';
import { cancelActiveReceipt, issueReceipt, type ReceiptType } from '../services/receipts.js';

const TX_SELECT = `
  SELECT t.*, c.name AS category_name, ev.name AS event_name, rt.name AS ritual_name,
         rc.id AS receipt_id, rc.receipt_number
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN events ev ON ev.id = t.event_id
    LEFT JOIN ritual_entries re ON re.id = t.ritual_entry_id
    LEFT JOIN rituals rt ON rt.id = re.ritual_id
    LEFT JOIN receipts rc ON rc.source_type = t.source_type AND rc.source_id = t.source_id AND rc.status = 'issued'`;

export function ledgerRoutes(db: Database) {
  const app = new Hono();

  app.get('/transactions', async (c) => {
    const { page, pageSize } = parse(pageQuery, c.req.query());
    const { from, to } = parse(rangeQuery, c.req.query());
    const q = c.req.query();
    const kind = q.kind ?? 'all';
    const kindSql: Record<string, string> = {
      all: 'TRUE',
      income: `t.transaction_type = 'income' AND t.source_type <> 'opening_balance'`,
      expense: `t.transaction_type = 'expense'`,
      donation: `t.source_type = 'donation'`,
      ritual_payment: `t.source_type = 'ritual_payment'`,
      event_expense: `t.transaction_type = 'expense' AND t.event_id IS NOT NULL`,
      other_income: `t.source_type = 'other_income'`,
    };
    const where = `WHERE ${kindSql[kind] ?? 'TRUE'}
      AND ($1::date IS NULL OR t.transaction_date >= $1) AND ($2::date IS NULL OR t.transaction_date <= $2)
      AND ($3::uuid IS NULL OR t.category_id = $3) AND ($4::uuid IS NULL OR t.event_id = $4)
      AND ($5::text IS NULL OR t.description ILIKE '%' || $5 || '%' OR t.party_name ILIKE '%' || $5 || '%'
           OR ev.name ILIKE '%' || $5 || '%' OR c.name ILIKE '%' || $5 || '%' OR rt.name ILIKE '%' || $5 || '%')`;
    const params = [from ?? null, to ?? null, q.category_id || null, q.event_id || null, q.search?.trim() || null];
    const items = await db.query(`${TX_SELECT} ${where} ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT $6 OFFSET $7`,
      [...params, pageSize, (page - 1) * pageSize]);
    const [totals] = await db.query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'income' AND t.source_type <> 'opening_balance'), 0)::bigint AS income,
              COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type = 'expense'), 0)::bigint AS expense
         FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN events ev ON ev.id = t.event_id
         LEFT JOIN ritual_entries re ON re.id = t.ritual_entry_id LEFT JOIN rituals rt ON rt.id = re.ritual_id ${where}`, params);
    return c.json({ items, totals, page, pageSize });
  });

  app.get('/transactions/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const [item] = await db.query(`${TX_SELECT} WHERE t.id = $1`, [id]);
    if (!item) throw notFound('Transaction');
    const history = await db.query(
      `SELECT action, created_at FROM audit_log WHERE entity_id = $1 ORDER BY created_at`, [(item as any).source_id]);
    return c.json({ item, history });
  });

  app.get('/dashboard', async (c) => {
    const { from, to } = parse(rangeQuery, c.req.query());
    const [period] = await db.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'income' AND source_type <> 'opening_balance'), 0)::bigint AS received,
              COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'expense'), 0)::bigint AS spent,
              COUNT(*) FILTER (WHERE source_type = 'donation')::int AS donation_count
         FROM transactions WHERE ($1::date IS NULL OR transaction_date >= $1) AND ($2::date IS NULL OR transaction_date <= $2)`,
      [from ?? null, to ?? null]);
    const [opening] = await db.query(`SELECT amount, transaction_date AS date FROM transactions WHERE source_type = 'opening_balance'`);
    const [pending] = await db.query(
      `SELECT COALESCE(SUM(GREATEST(e.prescribed_amount - COALESCE(p.paid, 0), 0)), 0)::bigint AS amount,
              COUNT(*) FILTER (WHERE e.prescribed_amount > COALESCE(p.paid, 0))::int AS count
         FROM ritual_entries e LEFT JOIN (SELECT ritual_entry_id, SUM(amount) AS paid FROM ritual_payments GROUP BY ritual_entry_id) p
           ON p.ritual_entry_id = e.id`);
    const recent = await db.query(`${TX_SELECT} ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT 6`);
    return c.json({ balance: await currentBalance(db), opening: opening ?? null, period, pending, recent });
  });

  app.get('/dashboard/chart', async (c) => {
    const { from, to } = parse(rangeQuery, c.req.query());
    const g = parse(z.enum(['day', 'month', 'year']).default('month'), c.req.query('granularity'));
    const fmt = { day: 'YYYY-MM-DD', month: 'YYYY-MM', year: 'YYYY' }[g];
    const items = await db.query(
      `SELECT to_char(date_trunc('${g}', transaction_date), '${fmt}') AS bucket,
              COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'income' AND source_type <> 'opening_balance'), 0)::bigint AS income,
              COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'expense'), 0)::bigint AS expense
         FROM transactions WHERE ($1::date IS NULL OR transaction_date >= $1) AND ($2::date IS NULL OR transaction_date <= $2)
        GROUP BY 1 ORDER BY 1`, [from ?? null, to ?? null]);
    return c.json({ granularity: g, items });
  });

  // ---- Receipts ----
  app.get('/receipts', async (c) => {
    const { page, pageSize } = parse(pageQuery, c.req.query());
    const q = c.req.query();
    const type = ['donation', 'ritual_payment', 'expense_bill'].includes(q.type ?? '') ? q.type : null;
    const status = ['issued', 'cancelled'].includes(q.status ?? '') ? q.status : null;
    const where = `WHERE ($1::text IS NULL OR receipt_type = $1) AND ($2::text IS NULL OR status = $2)
      AND ($3::text IS NULL OR receipt_number ILIKE '%' || $3 || '%' OR snapshot_data->>'name' ILIKE '%' || $3 || '%'
           OR snapshot_data->>'event_name' ILIKE '%' || $3 || '%')`;
    const params = [type, status, q.search?.trim() || null];
    const items = await db.query(
      `SELECT id, receipt_number, receipt_type, source_type, source_id, issue_date, status, cancel_reason, created_at,
              snapshot_data->>'name' AS name, snapshot_data->>'event_name' AS event_name, snapshot_data->>'title_kn' AS title_kn,
              COALESCE((snapshot_data->>'amount')::bigint, (snapshot_data->>'total')::bigint) AS amount, snapshot_data->>'date' AS date
         FROM receipts ${where} ORDER BY created_at DESC LIMIT $4 OFFSET $5`, [...params, pageSize, (page - 1) * pageSize]);
    const [{ count }] = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM receipts ${where}`, params);
    return c.json({ items, count, page, pageSize });
  });

  app.get('/receipts/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const [item] = await db.query<Record<string, any>>('SELECT * FROM receipts WHERE id = $1', [id]);
    if (!item) throw notFound('Receipt');
    const related = await db.query(
      `SELECT id, receipt_number, status, created_at, cancel_reason FROM receipts
        WHERE source_type = $1 AND source_id = $2 AND id <> $3 ORDER BY created_at DESC`, [item.source_type, item.source_id, id]);
    // Where the record behind this receipt lives in the app (null if it was deleted).
    let link: string | null = null;
    if (item.source_type === 'donation') {
      const [d] = await db.query('SELECT id FROM donations WHERE id = $1', [item.source_id]);
      if (d) link = `/donations/${item.source_id}`;
    } else if (item.source_type === 'ritual_payment') {
      const [p] = await db.query<{ ritual_entry_id: string }>('SELECT ritual_entry_id FROM ritual_payments WHERE id = $1', [item.source_id]);
      if (p) link = `/seves/${p.ritual_entry_id}`;
    } else {
      const [e] = await db.query('SELECT id FROM events WHERE id = $1', [item.source_id]);
      if (e) link = `/events/${item.source_id}`;
    }
    const replaces = item.replaces_receipt_id
      ? (await db.query<{ receipt_number: string }>('SELECT receipt_number FROM receipts WHERE id = $1', [item.replaces_receipt_id]))[0]?.receipt_number ?? null
      : null;
    return c.json({ item, related, link, replaces });
  });

  app.post('/receipts', async (c) => {
    const body = parse(z.object({
      receipt_type: z.enum(['donation', 'ritual_payment', 'expense_bill']), source_id: uuid, receipt_number: z.string().max(40).nullish(),
    }), await c.req.json());
    const receipt = await db.tx((q) => issueReceipt(q, body.receipt_type as ReceiptType, body.source_id, { receiptNumber: body.receipt_number ?? '' }));
    return c.json({ item: receipt });
  });

  app.post('/receipts/:id/cancel', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const body = parse(z.object({ reason: text(200) }), await c.req.json());
    const item = await db.tx(async (q) => {
      const [r] = await q.query<Record<string, any>>('SELECT * FROM receipts WHERE id = $1 FOR UPDATE', [id]);
      if (!r) throw notFound('Receipt');
      if (r.status !== 'issued') throw conflict('This receipt is already cancelled');
      const cancelled = await cancelActiveReceipt(q, r.source_type, r.source_id, body.reason);
      await audit(q, 'receipt', id, 'cancel', r, cancelled);
      return cancelled;
    });
    return c.json({ item });
  });

  /** Cancel a receipt and issue a fresh one with the record's current details. */
  app.post('/receipts/:id/reissue', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    const body = parse(z.object({ receipt_number: z.string().max(40).nullish() }), await c.req.json().catch(() => ({})));
    const item = await db.tx(async (q) => {
      const [r] = await q.query<Record<string, any>>('SELECT * FROM receipts WHERE id = $1 FOR UPDATE', [id]);
      if (!r) throw notFound('Receipt');
      if (r.status === 'issued') await cancelActiveReceipt(q, r.source_type, r.source_id, 'Reissued with updated details');
      return issueReceipt(q, r.receipt_type, r.source_id, { receiptNumber: body.receipt_number || r.receipt_number, replacesId: r.id });
    });
    return c.json({ item });
  });

  /** Permanently remove a receipt (valid or cancelled). The record it was issued for is kept. */
  app.delete('/receipts/:id', async (c) => {
    const id = parse(uuid, c.req.param('id'));
    await db.tx(async (q) => {
      const [r] = await q.query<Record<string, any>>('SELECT * FROM receipts WHERE id = $1 FOR UPDATE', [id]);
      if (!r) throw notFound('Receipt');
      await q.query('DELETE FROM receipts WHERE id = $1', [id]);
      await audit(q, 'receipt', id, 'delete', r, null);
    });
    return c.json({ ok: true });
  });

  // ---- Reports ----
  app.get('/reports', async (c) => {
    const { from, to } = parse(rangeQuery, c.req.query());
    const p = [from ?? null, to ?? null];
    const range = `($1::date IS NULL OR transaction_date >= $1) AND ($2::date IS NULL OR transaction_date <= $2)`;
    const sumBy = (expr: string) => `SELECT ${expr} AS label,
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'income' AND source_type <> 'opening_balance'), 0)::bigint AS income,
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'expense'), 0)::bigint AS expense
      FROM transactions WHERE ${range} GROUP BY 1 ORDER BY 1`;
    const [monthly, annual, byPurpose, topDonors, ritualCollection, pendingList, eventExpenses, categoryExpenses, incomeBySource] = await Promise.all([
      db.query(sumBy(`to_char(transaction_date, 'YYYY-MM')`), p),
      db.query(sumBy(`to_char(transaction_date, 'YYYY')`), p),
      db.query(`SELECT purpose AS label, SUM(amount)::bigint AS total, COUNT(*)::int AS count FROM donations
                 WHERE ($1::date IS NULL OR donation_date >= $1) AND ($2::date IS NULL OR donation_date <= $2)
                 GROUP BY purpose ORDER BY total DESC`, p),
      db.query(`SELECT donor_name AS label, SUM(amount)::bigint AS total, COUNT(*)::int AS count FROM donations
                 WHERE ($1::date IS NULL OR donation_date >= $1) AND ($2::date IS NULL OR donation_date <= $2)
                 GROUP BY donor_name ORDER BY total DESC LIMIT 10`, p),
      db.query(`SELECT r.name AS label, COUNT(e.id)::int AS count, SUM(e.prescribed_amount)::bigint AS prescribed,
                       SUM(COALESCE(p.paid, 0))::bigint AS collected,
                       SUM(GREATEST(e.prescribed_amount - COALESCE(p.paid, 0), 0))::bigint AS pending
                  FROM rituals r JOIN ritual_entries e ON e.ritual_id = r.id
                  LEFT JOIN (SELECT ritual_entry_id, SUM(amount) AS paid FROM ritual_payments GROUP BY ritual_entry_id) p ON p.ritual_entry_id = e.id
                 WHERE ($1::date IS NULL OR e.ritual_date >= $1) AND ($2::date IS NULL OR e.ritual_date <= $2)
                 GROUP BY r.id, r.name ORDER BY r.name`, p),
      db.query(`SELECT e.id, r.name AS ritual_name, e.devotee_name, e.ritual_date, e.prescribed_amount, COALESCE(p.paid, 0)::bigint AS paid,
                       (e.prescribed_amount - COALESCE(p.paid, 0))::bigint AS pending
                  FROM ritual_entries e JOIN rituals r ON r.id = e.ritual_id
                  LEFT JOIN (SELECT ritual_entry_id, SUM(amount) AS paid FROM ritual_payments GROUP BY ritual_entry_id) p ON p.ritual_entry_id = e.id
                 WHERE e.prescribed_amount > COALESCE(p.paid, 0) ORDER BY e.ritual_date`),
      db.query(`SELECT ev.name AS label, ev.event_date, SUM(t.amount)::bigint AS total, COUNT(*)::int AS count
                  FROM transactions t JOIN events ev ON ev.id = t.event_id
                 WHERE t.transaction_type = 'expense' AND ${range.replace(/transaction_date/g, 't.transaction_date')}
                 GROUP BY ev.id, ev.name, ev.event_date ORDER BY ev.event_date DESC`, p),
      db.query(`SELECT COALESCE(c.name, 'Uncategorised') AS label, SUM(t.amount)::bigint AS total, COUNT(*)::int AS count
                  FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
                 WHERE t.transaction_type = 'expense' AND ${range.replace(/transaction_date/g, 't.transaction_date')}
                 GROUP BY 1 ORDER BY total DESC`, p),
      db.query(`SELECT source_type AS label, SUM(amount)::bigint AS total, COUNT(*)::int AS count FROM transactions
                 WHERE transaction_type = 'income' AND source_type <> 'opening_balance' AND ${range} GROUP BY 1 ORDER BY total DESC`, p),
    ]);
    const [totals] = await db.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'income' AND source_type <> 'opening_balance'), 0)::bigint AS income,
              COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'expense'), 0)::bigint AS expense
         FROM transactions WHERE ${range}`, p);
    const [opening] = await db.query<{ amount: number }>(`SELECT amount FROM transactions WHERE source_type = 'opening_balance'`);
    return c.json({
      range: { from: from ?? null, to: to ?? null },
      totals, balance: await currentBalance(db), opening: opening?.amount ?? 0,
      monthly, annual, byPurpose, topDonors,
      ritualCollection,
      pendingList, eventExpenses, categoryExpenses, incomeBySource,
    });
  });

  app.get('/reports/as-of', async (c) => {
    const date = parse(isoDate, c.req.query('date'));
    const [row] = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE -amount END), 0)::bigint AS balance
         FROM transactions WHERE transaction_date <= $1`, [date]);
    return c.json(row);
  });

  return app;
}
