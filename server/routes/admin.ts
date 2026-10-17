import { Hono } from 'hono';
import { z } from 'zod';
import type { Database, Queryable } from '../db/types.js';
import { ApiError, parse, conflict, invalid } from '../lib/http.js';
import { clearCategoryCache } from '../services/ledger.js';
import { todayIST } from '../../shared/dates.js';

/** Tables in dependency order (parents first). */
const TABLES = [
  'financial_settings', 'categories', 'events', 'rituals', 'ritual_entries', 'ritual_payments',
  'donations', 'expenses', 'incomes', 'transactions', 'receipt_sequences', 'receipts', 'audit_log',
] as const;
type Table = (typeof TABLES)[number];

const SOURCE_TABLE: Record<string, Table> = {
  donation: 'donations', ritual_payment: 'ritual_payments', other_income: 'incomes', expense: 'expenses',
};

const backupSchema = z.object({
  app: z.literal('maada-finance'),
  version: z.literal(1),
  exported_at: z.string(),
  tables: z.object(Object.fromEntries(TABLES.map((t) => [t, z.array(z.record(z.string(), z.unknown()))])) as Record<Table, z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>>),
});
type Backup = z.infer<typeof backupSchema>;

/** Check the backup is internally consistent before anything is replaced. Returns a list of problems. */
export function validateBackup(b: Backup): string[] {
  const problems: string[] = [];
  const ids = (t: Table) => new Set(b.tables[t].map((r) => String(r.id)));
  const byId = (t: Table) => new Map(b.tables[t].map((r) => [String(r.id), r]));
  if (b.tables.financial_settings.length !== 1) problems.push('Backup must contain exactly one settings record');
  const events = ids('events'); const rituals = ids('rituals'); const entries = ids('ritual_entries');
  const categories = ids('categories');
  for (const e of b.tables.ritual_entries) {
    if (!rituals.has(String(e.ritual_id))) problems.push(`Seve entry ${e.id} refers to a missing seve`);
    if (e.event_id && !events.has(String(e.event_id))) problems.push(`Seve entry ${e.id} refers to a missing event`);
  }
  for (const p of b.tables.ritual_payments) if (!entries.has(String(p.ritual_entry_id))) problems.push(`Payment ${p.id} refers to a missing seve entry`);
  for (const x of b.tables.expenses) {
    if (!categories.has(String(x.category_id))) problems.push(`Expense ${x.id} refers to a missing category`);
    if (x.event_id && !events.has(String(x.event_id))) problems.push(`Expense ${x.id} refers to a missing event`);
  }
  const sources = Object.fromEntries(Object.entries(SOURCE_TABLE).map(([k, t]) => [k, byId(t)]));
  const seen = new Set<string>();
  let openings = 0;
  for (const t of b.tables.transactions) {
    const key = `${t.source_type}:${t.source_id}`;
    if (seen.has(key)) problems.push(`Duplicate ledger entry for ${key}`);
    seen.add(key);
    if (t.source_type === 'opening_balance') { openings++; continue; }
    const src = sources[String(t.source_type)]?.get(String(t.source_id));
    if (!src) problems.push(`Ledger entry ${t.id} has no matching ${t.source_type} record`);
    else if (Number(src.amount) !== Number(t.amount)) problems.push(`Ledger entry ${t.id} amount does not match its record`);
  }
  if (openings > 1) problems.push('More than one opening balance');
  for (const [type, map] of Object.entries(sources)) {
    for (const id of map.keys()) if (!seen.has(`${type}:${id}`)) problems.push(`${type} ${id} is missing from the ledger`);
  }
  const numbers = new Set<string>();
  for (const r of b.tables.receipts) {
    if (numbers.has(String(r.receipt_number))) problems.push(`Receipt number ${r.receipt_number} appears twice`);
    numbers.add(String(r.receipt_number));
  }
  return problems.slice(0, 50);
}

export async function exportBackup(db: Queryable) {
  const tables = {} as Record<Table, unknown[]>;
  for (const t of TABLES) tables[t] = await db.query(`SELECT * FROM ${t}`);
  return { app: 'maada-finance' as const, version: 1 as const, exported_at: new Date().toISOString(), tables };
}

async function restore(q: Queryable, b: Backup) {
  await q.query(`TRUNCATE ${[...TABLES].reverse().join(', ')} RESTART IDENTITY CASCADE`);
  for (const t of TABLES) {
    const rows = b.tables[t];
    if (!rows.length) continue;
    if (t === 'audit_log') {
      await q.query(`INSERT INTO audit_log (entity_type, entity_id, action, before_data, after_data, created_at)
        SELECT entity_type, entity_id, action, before_data, after_data, created_at FROM json_populate_recordset(NULL::audit_log, $1)`,
      [JSON.stringify(rows)]);
      continue;
    }
    const clean = t === 'financial_settings' ? rows.map((r) => ({ ...r, temple_photo_asset_id: null })) : rows;
    await q.query(`INSERT INTO ${t} SELECT * FROM json_populate_recordset(NULL::${t}, $1)`, [JSON.stringify(clean)]);
  }
  clearCategoryCache();
}

export function adminRoutes(db: Database) {
  const app = new Hono();

  app.get('/backup', async (c) => {
    const data = await exportBackup(db);
    c.header('Content-Disposition', `attachment; filename="maada-backup-${todayIST()}.json"`);
    return c.json(data);
  });

  app.post('/backup/validate', async (c) => {
    const b = parse(backupSchema, await c.req.json());
    const problems = validateBackup(b);
    const counts = Object.fromEntries(TABLES.map((t) => [t, b.tables[t].length]));
    return c.json({ ok: problems.length === 0, problems, counts, exported_at: b.exported_at });
  });

  app.post('/backup/restore', async (c) => {
    if (c.req.header('x-confirm-restore') !== 'REPLACE-ALL-DATA') {
      throw new ApiError(400, 'confirmation_required', 'Restoring replaces all data. Send the confirmation header to proceed.');
    }
    const b = parse(backupSchema, await c.req.json());
    const problems = validateBackup(b);
    if (problems.length) throw invalid('The backup file has problems and was not restored.', problems);
    await db.tx((q) => restore(q, b));
    return c.json({ ok: true });
  });

  /** Verify that every record appears in the ledger exactly once with the same amount. */
  app.get('/admin/integrity', async (c) => {
    const problems = validateBackup((await exportBackup(db)) as unknown as Backup);
    return c.json({ ok: problems.length === 0, problems });
  });

  app.get('/admin/demo-data', async (c) => {
    const [row] = await db.query<{ n: number }>(
      `SELECT ((SELECT COUNT(*) FROM donations WHERE is_demo) + (SELECT COUNT(*) FROM ritual_entries WHERE is_demo)
             + (SELECT COUNT(*) FROM expenses WHERE is_demo) + (SELECT COUNT(*) FROM events WHERE is_demo))::int AS n`);
    return c.json({ present: row.n > 0 });
  });

  /** Remove every record created as sample data, together with its ledger rows and receipts. */
  app.delete('/admin/demo-data', async (c) => {
    await db.tx(async (q) => {
      await q.query(`DELETE FROM receipts WHERE is_demo
        OR (source_type = 'donation' AND source_id IN (SELECT id FROM donations WHERE is_demo))
        OR (source_type = 'ritual_payment' AND source_id IN (SELECT p.id FROM ritual_payments p JOIN ritual_entries e ON e.id = p.ritual_entry_id WHERE e.is_demo))
        OR (source_type = 'event' AND source_id IN (SELECT id FROM events WHERE is_demo))`);
      await q.query(`DELETE FROM transactions WHERE
           (source_type = 'donation' AND source_id IN (SELECT id FROM donations WHERE is_demo))
        OR (source_type = 'ritual_payment' AND source_id IN (SELECT p.id FROM ritual_payments p JOIN ritual_entries e ON e.id = p.ritual_entry_id WHERE e.is_demo))
        OR (source_type = 'expense' AND source_id IN (SELECT id FROM expenses WHERE is_demo))
        OR (source_type = 'other_income' AND source_id IN (SELECT id FROM incomes WHERE is_demo))`);
      await q.query('DELETE FROM donations WHERE is_demo');
      await q.query('DELETE FROM expenses WHERE is_demo');
      await q.query('DELETE FROM incomes WHERE is_demo');
      await q.query('DELETE FROM ritual_entries WHERE is_demo');
      await q.query('DELETE FROM events WHERE is_demo AND id NOT IN (SELECT event_id FROM expenses WHERE event_id IS NOT NULL UNION SELECT event_id FROM incomes WHERE event_id IS NOT NULL)');
      const [{ n }] = await q.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM receipts');
      if (n === 0) await q.query('DELETE FROM receipt_sequences');
    });
    return c.json({ ok: true });
  });

  /** Erase everything (keeps settings, categories and seve types). */
  app.post('/admin/erase-all', async (c) => {
    if (c.req.header('x-confirm-erase') !== 'ERASE-ALL-DATA') throw conflict('Confirmation required');
    await db.tx(async (q) => {
      await q.query('TRUNCATE receipts, receipt_sequences, transactions, ritual_payments, ritual_entries, donations, expenses, incomes, events, audit_log RESTART IDENTITY CASCADE');
    });
    return c.json({ ok: true });
  });

  return app;
}
