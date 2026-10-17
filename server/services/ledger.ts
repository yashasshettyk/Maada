import type { Queryable } from '../db/types.js';

export type SourceType = 'opening_balance' | 'donation' | 'ritual_payment' | 'other_income' | 'expense';

export const OPENING_BALANCE_SOURCE_ID = '00000000-0000-0000-0000-000000000001';

export interface LedgerEntry {
  sourceType: SourceType;
  sourceId: string;
  amount: number;
  date: string;
  description: string;
  categoryId: string | null;
  eventId?: string | null;
  ritualEntryId?: string | null;
  partyName?: string | null;
  notes?: string | null;
}

/**
 * Create or update the single ledger row for a source record. The unique
 * (source_type, source_id) constraint guarantees a source is never counted twice.
 */
export async function upsertLedger(q: Queryable, e: LedgerEntry): Promise<void> {
  const type = e.sourceType === 'expense' ? 'expense' : 'income';
  await q.query(
    `INSERT INTO transactions (transaction_type, source_type, source_id, amount, transaction_date, description,
       category_id, event_id, ritual_entry_id, party_name, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (source_type, source_id) DO UPDATE SET
       amount = EXCLUDED.amount, transaction_date = EXCLUDED.transaction_date, description = EXCLUDED.description,
       category_id = EXCLUDED.category_id, event_id = EXCLUDED.event_id, ritual_entry_id = EXCLUDED.ritual_entry_id,
       party_name = EXCLUDED.party_name, notes = EXCLUDED.notes, updated_at = now()`,
    [type, e.sourceType, e.sourceId, e.amount, e.date, e.description, e.categoryId, e.eventId ?? null,
      e.ritualEntryId ?? null, e.partyName ?? null, e.notes ?? null],
  );
}

export async function deleteLedger(q: Queryable, sourceType: SourceType, sourceId: string): Promise<void> {
  await q.query('DELETE FROM transactions WHERE source_type = $1 AND source_id = $2', [sourceType, sourceId]);
}

const categoryCache = new Map<string, string>();

export async function systemCategoryId(q: Queryable, key: string): Promise<string> {
  const cached = categoryCache.get(key);
  if (cached) return cached;
  const rows = await q.query<{ id: string }>('SELECT id FROM categories WHERE system_key = $1', [key]);
  if (!rows[0]) throw new Error(`System category ${key} is missing`);
  categoryCache.set(key, rows[0].id);
  return rows[0].id;
}

export function clearCategoryCache() {
  categoryCache.clear();
}

export async function audit(
  q: Queryable, entityType: string, entityId: string,
  action: 'create' | 'update' | 'delete' | 'cancel' | 'restore', before: unknown, after: unknown,
): Promise<void> {
  await q.query(
    'INSERT INTO audit_log (entity_type, entity_id, action, before_data, after_data) VALUES ($1,$2,$3,$4,$5)',
    [entityType, entityId, action, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)],
  );
}

/** Current balance = opening balance + income - expenses, always computed from the ledger. */
export async function currentBalance(q: Queryable): Promise<number> {
  const rows = await q.query<{ balance: number }>(
    `SELECT COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE -amount END), 0)::bigint AS balance FROM transactions`,
  );
  return rows[0].balance;
}
