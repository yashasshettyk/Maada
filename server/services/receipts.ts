import type { Queryable } from '../db/types.js';
import { todayIST } from '../../shared/dates.js';
import { amountInWords } from '../../shared/words.js';
import { amountInKannadaWords } from '../../shared/words-kn.js';
import { notFound } from '../lib/http.js';

export type ReceiptType = 'donation' | 'ritual_payment' | 'expense_bill';
type SourceType = 'donation' | 'ritual_payment' | 'event';

const SOURCE_OF: Record<ReceiptType, SourceType> = {
  donation: 'donation',
  ritual_payment: 'ritual_payment',
  expense_bill: 'event',
};

interface Settings {
  institution_name_kn: string;
  donation_title_kn: string;
  bill_title_kn: string;
  donation_ack_kn: string;
  seve_ack_kn: string;
  receipt_footer_kn: string;
  donation_prefix: string;
  seve_prefix: string;
  bill_prefix: string;
}

async function settings(q: Queryable): Promise<Settings> {
  return (await q.query<Settings>('SELECT * FROM financial_settings WHERE id = 1'))[0];
}

/**
 * Atomically reserve the next number in a per-type, per-year sequence. The upsert
 * takes a row lock, so concurrent requests can never receive the same number.
 */
export async function nextReceiptNumber(q: Queryable, type: ReceiptType, prefix: string, year: number): Promise<string> {
  const rows = await q.query<{ last_value: number }>(
    `INSERT INTO receipt_sequences (receipt_type, year, last_value) VALUES ($1, $2, 1)
     ON CONFLICT (receipt_type, year) DO UPDATE SET last_value = receipt_sequences.last_value + 1
     RETURNING last_value`,
    [type, year],
  );
  return `${prefix.trim()}-${year}-${String(rows[0].last_value).padStart(5, '0')}`;
}

async function buildSnapshot(q: Queryable, type: ReceiptType, sourceId: string, s: Settings) {
  if (type === 'donation') {
    const d = (await q.query<Record<string, any>>('SELECT * FROM donations WHERE id = $1', [sourceId]))[0];
    if (!d) throw notFound('Donation');
    return {
      date: d.donation_date as string,
      snapshot: {
        institution_name_kn: s.institution_name_kn,
        title_kn: s.donation_title_kn,
        name: d.donor_name,
        amount: d.amount,
        amount_words_kn: amountInKannadaWords(d.amount),
        amount_words_en: amountInWords(d.amount),
        purpose: d.purpose,
        payment_method: d.payment_method,
        reference_number: d.reference_number,
        acknowledgment_kn: s.donation_ack_kn,
        footer_kn: s.receipt_footer_kn,
      },
    };
  }
  if (type === 'ritual_payment') {
    const p = (await q.query<Record<string, any>>(
      `SELECT p.*, e.devotee_name, e.ritual_date, e.prescribed_amount, r.name AS ritual_name, r.receipt_title
         FROM ritual_payments p JOIN ritual_entries e ON e.id = p.ritual_entry_id JOIN rituals r ON r.id = e.ritual_id
        WHERE p.id = $1`, [sourceId]))[0];
    if (!p) throw notFound('Ritual payment');
    const prev = (await q.query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS total FROM ritual_payments
        WHERE ritual_entry_id = $1 AND (payment_date, created_at, id) < ($2::date, $3::timestamptz, $4::uuid)`,
      [p.ritual_entry_id, p.payment_date, p.created_at, p.id]))[0].total;
    return {
      date: p.payment_date as string,
      snapshot: {
        institution_name_kn: s.institution_name_kn,
        title_kn: p.receipt_title || p.ritual_name,
        ritual_name: p.ritual_name,
        name: p.devotee_name,
        amount: p.amount,
        amount_words_kn: amountInKannadaWords(p.amount),
        amount_words_en: amountInWords(p.amount),
        seve_date: p.ritual_date,
        prescribed_amount: p.prescribed_amount,
        previously_paid: prev,
        remaining: Math.max(p.prescribed_amount - prev - p.amount, 0),
        acknowledgment_kn: s.seve_ack_kn,
        footer_kn: s.receipt_footer_kn,
      },
    };
  }
  const ev = (await q.query<Record<string, any>>('SELECT * FROM events WHERE id = $1', [sourceId]))[0];
  if (!ev) throw notFound('Event');
  const items = await q.query<Record<string, any>>(
    `SELECT x.title, x.vendor, x.quantity, x.unit_rate, x.amount, c.name AS category
       FROM expenses x JOIN categories c ON c.id = x.category_id
      WHERE x.event_id = $1 ORDER BY x.expense_date, x.created_at`, [sourceId]);
  const totals = (await q.query<{ income: number; expense: number }>(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'income'), 0)::bigint AS income,
            COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'expense'), 0)::bigint AS expense
       FROM transactions WHERE event_id = $1`, [sourceId]))[0];
  return {
    date: todayIST(),
    snapshot: {
      institution_name_kn: s.institution_name_kn,
      title_kn: s.bill_title_kn,
      event_name: ev.name,
      event_date: ev.event_date,
      items: items.map((i) => ({
        title: i.title, vendor: i.vendor, quantity: i.quantity, unit_rate: i.unit_rate, amount: i.amount, category: i.category,
      })),
      total: totals.expense,
      total_words_en: amountInWords(totals.expense),
      income: totals.income,
      balance: totals.income - totals.expense,
    },
  };
}

export async function activeReceipt(q: Queryable, sourceType: SourceType, sourceId: string) {
  return (await q.query<Record<string, any>>(
    `SELECT * FROM receipts WHERE source_type = $1 AND source_id = $2 AND status = 'issued'`, [sourceType, sourceId]))[0] ?? null;
}

/**
 * Issue a receipt for a saved record. Idempotent: if a valid receipt already exists
 * for the record it is returned unchanged rather than numbering a second one.
 */
export async function issueReceipt(q: Queryable, type: ReceiptType, sourceId: string, opts: { replacesId?: string; isDemo?: boolean } = {}) {
  const sourceType = SOURCE_OF[type];
  const existing = await activeReceipt(q, sourceType, sourceId);
  if (existing) return existing;
  const s = await settings(q);
  const { date, snapshot } = await buildSnapshot(q, type, sourceId, s);
  const issueDate = todayIST();
  const prefix = type === 'donation' ? s.donation_prefix : type === 'ritual_payment' ? s.seve_prefix : s.bill_prefix;
  const number = await nextReceiptNumber(q, type, prefix, Number(issueDate.slice(0, 4)));
  const rows = await q.query<Record<string, any>>(
    `INSERT INTO receipts (receipt_number, receipt_type, source_type, source_id, issue_date, snapshot_data, replaces_receipt_id, is_demo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [number, type, sourceType, sourceId, issueDate, JSON.stringify({ ...snapshot, receipt_number: number, date }), opts.replacesId ?? null, opts.isDemo ?? false],
  );
  return rows[0];
}

/** Cancel the valid receipt for a record (keeping it on file) and return it, if any. */
export async function cancelActiveReceipt(q: Queryable, sourceType: SourceType, sourceId: string, reason: string) {
  const rows = await q.query<Record<string, any>>(
    `UPDATE receipts SET status = 'cancelled', cancelled_at = now(), cancel_reason = $3
      WHERE source_type = $1 AND source_id = $2 AND status = 'issued' RETURNING *`,
    [sourceType, sourceId, reason],
  );
  return rows[0] ?? null;
}

/** After a record is corrected, cancel its old receipt and issue a fresh one that references it. */
export async function reissueIfIssued(q: Queryable, type: ReceiptType, sourceId: string, reason: string) {
  const old = await cancelActiveReceipt(q, SOURCE_OF[type], sourceId, reason);
  if (old) return issueReceipt(q, type, sourceId, { replacesId: old.id, isDemo: old.is_demo });
  return null;
}
