import { beforeEach, describe, expect, it } from 'vitest';
import { setup, id, RUPEE } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof setup>>;
let t: Ctx;
beforeEach(async () => { t = await setup(); });

const donation = (amount: number, extra: Record<string, unknown> = {}) => ({
  id: id(), donor_name: 'Yashas Shetty', donation_date: '2026-10-16', amount, purpose: 'Maada development', ...extra,
});
const openWith = (amount: number) => t.ok('PUT', '/settings/opening-balance', { amount, date: '2026-04-01' });
async function expense(amount: number) {
  const body = { id: id(), title: 'Ritual items', amount, expense_date: '2026-10-10', category_id: await t.category('Pooja Materials') };
  await t.ok('POST', '/expenses', body);
  return body;
}

describe('central ledger', () => {
  it('scenario 1: opening balance', async () => {
    await openWith(50_000 * RUPEE);
    expect(await t.balance()).toBe(50_000 * RUPEE);
  });

  it('opening balance is corrected in place, never added twice', async () => {
    await openWith(50_000 * RUPEE);
    await openWith(60_000 * RUPEE);
    await openWith(60_000 * RUPEE);
    expect(await t.balance()).toBe(60_000 * RUPEE);
    const rows = await t.db.query(`SELECT * FROM transactions WHERE source_type = 'opening_balance'`);
    expect(rows).toHaveLength(1);
  });

  it('scenario 2: donation', async () => {
    await openWith(50_000 * RUPEE);
    await t.ok('POST', '/donations', donation(5_000 * RUPEE));
    expect(await t.balance()).toBe(55_000 * RUPEE);
  });

  it('scenario 3: expense', async () => {
    await openWith(50_000 * RUPEE);
    await expense(8_000 * RUPEE);
    expect(await t.balance()).toBe(42_000 * RUPEE);
  });

  it('scenario 4: multiple transactions', async () => {
    await openWith(50_000 * RUPEE);
    await t.ok('POST', '/donations', donation(5_000 * RUPEE));
    await t.ok('POST', '/ritual-entries', {
      id: id(), ritual_id: await t.sankranti(), devotee_name: 'Ramesh', ritual_date: '2026-10-17', prescribed_amount: 2_000 * RUPEE,
      initial_payment: { id: id(), amount: 2_000 * RUPEE, payment_date: '2026-10-14' },
    });
    await expense(8_000 * RUPEE);
    await expense(2_000 * RUPEE);
    expect(await t.balance()).toBe(47_000 * RUPEE);
    const dash = await t.ok('GET', '/dashboard');
    expect(dash.period.received).toBe(7_000 * RUPEE);
    expect(dash.period.spent).toBe(10_000 * RUPEE);
  });

  it('scenario 5: partial ritual payments and pending amount', async () => {
    const entryId = id();
    await t.ok('POST', '/ritual-entries', {
      id: entryId, ritual_id: await t.sankranti(), devotee_name: 'Ramesh', ritual_date: '2026-10-20', prescribed_amount: 2_000 * RUPEE,
    });
    const pending = async () => (await t.ok('GET', `/ritual-entries/${entryId}`)).item;
    expect((await pending()).status).toBe('pending');
    // The prescribed amount is not income until it is actually received.
    expect(await t.balance()).toBe(0);
    await t.ok('POST', `/ritual-entries/${entryId}/payments`, { id: id(), amount: 1_000 * RUPEE, payment_date: '2026-10-01' });
    expect((await pending()).pending).toBe(1_000 * RUPEE);
    await t.ok('POST', `/ritual-entries/${entryId}/payments`, { id: id(), amount: 500 * RUPEE, payment_date: '2026-10-05' });
    const e = await pending();
    expect(e.pending).toBe(500 * RUPEE);
    expect(e.status).toBe('partial');
    expect(await t.balance()).toBe(1_500 * RUPEE);
    expect((await t.ok('GET', '/dashboard')).pending.amount).toBe(500 * RUPEE);
  });

  it('refuses overpayment unless allowed in settings', async () => {
    const entryId = id();
    await t.ok('POST', '/ritual-entries', {
      id: entryId, ritual_id: await t.sankranti(), devotee_name: 'Ramesh', ritual_date: '2026-10-20', prescribed_amount: 1_000 * RUPEE,
    });
    const r = await t.call('POST', `/ritual-entries/${entryId}/payments`, { id: id(), amount: 1_500 * RUPEE, payment_date: '2026-10-01' });
    expect(r.status).toBe(422);
    await t.ok('PUT', '/settings', { allow_overpayment: true });
    await t.ok('POST', `/ritual-entries/${entryId}/payments`, { id: id(), amount: 1_500 * RUPEE, payment_date: '2026-10-01' });
    expect((await t.ok('GET', `/ritual-entries/${entryId}`)).item.status).toBe('overpaid');
  });

  it('scenario 6: the same payment submitted twice is recorded once', async () => {
    const entryId = id();
    await t.ok('POST', '/ritual-entries', {
      id: entryId, ritual_id: await t.sankranti(), devotee_name: 'Ramesh', ritual_date: '2026-10-20', prescribed_amount: 2_000 * RUPEE,
    });
    const payment = { id: id(), amount: 1_000 * RUPEE, payment_date: '2026-10-01', issue_receipt: true };
    const [a, b] = await Promise.all([
      t.call('POST', `/ritual-entries/${entryId}/payments`, payment),
      t.call('POST', `/ritual-entries/${entryId}/payments`, payment),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.receipt.receipt_number).toBe(b.body.receipt.receipt_number);
    const rows = await t.db.query(`SELECT * FROM transactions WHERE source_type = 'ritual_payment'`);
    expect(rows).toHaveLength(1);
    expect(await t.balance()).toBe(1_000 * RUPEE);
    const receipts = await t.db.query('SELECT * FROM receipts');
    expect(receipts).toHaveLength(1);
  });

  it('duplicate donation submissions do not double the balance', async () => {
    const d = donation(5_000 * RUPEE);
    await t.ok('POST', '/donations', d);
    const again = await t.call('POST', '/donations', d);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(await t.balance()).toBe(5_000 * RUPEE);
  });

  it('scenario 7: editing an expense changes the balance by the difference only', async () => {
    await openWith(50_000 * RUPEE);
    const x = await expense(1_000 * RUPEE);
    expect(await t.balance()).toBe(49_000 * RUPEE);
    await t.ok('PUT', `/expenses/${x.id}`, { ...x, id: undefined, amount: 1_500 * RUPEE });
    expect(await t.balance()).toBe(48_500 * RUPEE);
  });

  it('scenario 8: deleting an expense restores the balance', async () => {
    await openWith(50_000 * RUPEE);
    const x = await expense(1_000 * RUPEE);
    await t.ok('DELETE', `/expenses/${x.id}`);
    expect(await t.balance()).toBe(50_000 * RUPEE);
  });

  it('event totals equal the sum of their expenses and are not double counted', async () => {
    await openWith(50_000 * RUPEE);
    const ev = id();
    await t.ok('POST', '/events', { id: ev, name: 'Annual Temple Festival', event_date: '2026-10-12' });
    for (const [title, amount, cat] of [['Flowers', 2_000, 'Flowers'], ['Pooja items', 3_500, 'Pooja Materials'], ['Food', 5_000, 'Food & Refreshments'], ['Decorations', 1_500, 'Decorations']] as const) {
      await t.ok('POST', '/expenses', { id: id(), title, amount: amount * RUPEE, expense_date: '2026-10-12', category_id: await t.category(cat), event_id: ev });
    }
    const detail = await t.ok('GET', `/events/${ev}`);
    expect(detail.totals.expense).toBe(12_000 * RUPEE);
    expect(detail.breakdown.reduce((s: number, b: any) => s + b.total, 0)).toBe(12_000 * RUPEE);
    expect(await t.balance()).toBe(38_000 * RUPEE);
  });

  it('dashboard totals agree with transaction history for a period', async () => {
    await openWith(10_000 * RUPEE);
    await t.ok('POST', '/donations', donation(700 * RUPEE, { donation_date: '2026-09-30' }));
    await t.ok('POST', '/donations', donation(300 * RUPEE, { donation_date: '2026-10-01' }));
    await expense(200 * RUPEE);
    const q = '?from=2026-10-01&to=2026-10-31';
    const dash = await t.ok('GET', `/dashboard${q}`);
    const tx = await t.ok('GET', `/transactions${q}`);
    const reports = await t.ok('GET', `/reports${q}`);
    expect(dash.period.received).toBe(300 * RUPEE);
    expect(tx.totals.income).toBe(dash.period.received);
    expect(tx.totals.expense).toBe(dash.period.spent);
    expect(reports.totals.income).toBe(dash.period.received);
    expect(reports.totals.expense).toBe(dash.period.spent);
    expect(reports.balance).toBe(dash.balance);
  });
});

describe('receipts', () => {
  it('scenario 9: a donation receipt carries the saved details and a unique number', async () => {
    const d = donation(5_000 * RUPEE, { donor_name: 'ಯಶಸ್ ಶೆಟ್ಟಿ', purpose: 'For Maada Development and Temple Maintenance', issue_receipt: true });
    const res = await t.ok('POST', '/donations', d);
    const snap = res.receipt.snapshot_data;
    expect(res.receipt.receipt_number).toMatch(/^ದೇ-\d{4}-00001$/);
    expect(snap.name).toBe('ಯಶಸ್ ಶೆಟ್ಟಿ');
    expect(snap.date).toBe('2026-10-16');
    expect(snap.amount).toBe(500_000);
    expect(snap.amount_words_en).toBe('Rupees Five Thousand Only');
    expect(snap.amount_words_kn).toBe('ಐದು ಸಾವಿರ ರೂಪಾಯಿಗಳು ಮಾತ್ರ');
    expect(snap.purpose).toBe('For Maada Development and Temple Maintenance');
    const second = await t.ok('POST', '/donations', donation(100 * RUPEE, { issue_receipt: true }));
    expect(second.receipt.receipt_number).toMatch(/-00002$/);
  });

  it('numbers stay unique when many receipts are issued at once', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => t.ok('POST', '/donations', donation(100 * RUPEE, { issue_receipt: true }))));
    const numbers = results.map((r) => r.receipt.receipt_number);
    expect(new Set(numbers).size).toBe(12);
  });

  it('editing a donation keeps the old receipt as cancelled and issues a new one', async () => {
    const d = donation(5_000 * RUPEE, { issue_receipt: true });
    const first = await t.ok('POST', '/donations', d);
    const { id: donationId, issue_receipt: _, ...fields } = d;
    const edited = await t.ok('PUT', `/donations/${donationId}`, { ...fields, amount: 6_000 * RUPEE });
    expect(edited.receipt.receipt_number).not.toBe(first.receipt.receipt_number);
    expect(edited.receipt.replaces_receipt_id).toBe(first.receipt.id);
    const old = await t.ok('GET', `/receipts/${first.receipt.id}`);
    expect(old.item.status).toBe('cancelled');
    expect(old.item.snapshot_data.amount).toBe(500_000);
  });

  it('deleting a donation cancels (but keeps) its receipt', async () => {
    const d = donation(5_000 * RUPEE, { issue_receipt: true });
    const first = await t.ok('POST', '/donations', d);
    await t.ok('DELETE', `/donations/${d.id}`);
    const old = await t.ok('GET', `/receipts/${first.receipt.id}`);
    expect(old.item.status).toBe('cancelled');
    expect(await t.balance()).toBe(0);
  });

  it('seve receipt shows the seve title in Kannada, devotee and amount', async () => {
    const res = await t.ok('POST', '/ritual-entries', {
      id: id(), ritual_id: await t.sankranti(), devotee_name: 'ರಮೇಶ್ ಪೂಜಾರಿ', ritual_date: '2026-10-17', prescribed_amount: 500 * RUPEE,
      initial_payment: { id: id(), amount: 500 * RUPEE, payment_date: '2026-10-14' }, issue_receipt: true,
    });
    const s = res.receipt.snapshot_data;
    expect(res.receipt.receipt_number).toMatch(/^ಸೇ-\d{4}-00001$/);
    expect(s.title_kn).toBe('ಸಂಕ್ರಾಂತಿ ಸೇವೆ');
    expect(s.seve_date).toBe('2026-10-17');
    expect(s.amount_words_kn).toBe('ಐನೂರು ರೂಪಾಯಿಗಳು ಮಾತ್ರ');
  });

  it('expense bill lists the event items with income and balance', async () => {
    const ev = id();
    await t.ok('POST', '/events', { id: ev, name: 'Sankranti Seve', event_date: '2026-10-17' });
    await t.ok('POST', '/expenses', { id: id(), title: 'Jasmine flowers', quantity: '4 bundles', unit_rate: 25_000, amount: 100_000, expense_date: '2026-10-17', category_id: await t.category('Flowers'), event_id: ev, vendor: 'Flower market' });
    await t.ok('POST', '/expenses', { id: id(), title: 'Coconuts', quantity: '25 nos', unit_rate: 3_500, amount: 87_500, expense_date: '2026-10-17', category_id: await t.category('Pooja Materials'), event_id: ev });
    await t.ok('POST', '/ritual-entries', {
      id: id(), ritual_id: await t.sankranti(), devotee_name: 'Ganesh', ritual_date: '2026-10-17', prescribed_amount: 500 * RUPEE, event_id: ev,
      initial_payment: { id: id(), amount: 500 * RUPEE, payment_date: '2026-10-17' },
    });
    const { receipt } = await t.ok('POST', `/events/${ev}/bill`);
    expect(receipt.receipt_number).toMatch(/^EXP-\d{4}-00001$/);
    expect(receipt.snapshot_data.items).toHaveLength(2);
    expect(receipt.snapshot_data.total).toBe(187_500);
    expect(receipt.snapshot_data.income).toBe(50_000);
    expect(receipt.snapshot_data.balance).toBe(50_000 - 187_500);
    const again = await t.ok('POST', `/events/${ev}/bill`);
    expect(again.receipt.id).toBe(receipt.id);
    const refreshed = await t.ok('POST', `/events/${ev}/bill?refresh=1`);
    expect(refreshed.receipt.receipt_number).toMatch(/-00002$/);
  });
});

describe('validation and failures', () => {
  it('rejects invalid input with clear messages', async () => {
    const bad = await t.call('POST', '/donations', donation(-5));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_error');
    const zero = await t.call('POST', '/donations', donation(0));
    expect(zero.status).toBe(400);
    const date = await t.call('POST', '/donations', donation(100, { donation_date: '2026-02-30' }));
    expect(date.status).toBe(400);
    const fraction = await t.call('POST', '/donations', donation(10.5));
    expect(fraction.status).toBe(400);
    const name = await t.call('POST', '/donations', donation(100, { donor_name: '   ' }));
    expect(name.status).toBe(400);
  });

  it('a failure part-way through saving leaves nothing behind', async () => {
    await t.db.query(`CREATE FUNCTION fail_ledger() RETURNS trigger AS $$ BEGIN
      IF NEW.party_name = 'FAIL' THEN RAISE EXCEPTION 'simulated database failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await t.db.query('CREATE TRIGGER fail_ledger BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION fail_ledger()');
    const d = donation(100 * RUPEE, { donor_name: 'FAIL', issue_receipt: true });
    const res = await t.call('POST', '/donations', d);
    expect(res.status).toBe(500);
    expect(await t.db.query('SELECT * FROM donations')).toHaveLength(0);
    expect(await t.db.query('SELECT * FROM receipts')).toHaveLength(0);
    expect(await t.balance()).toBe(0);
  });

  it('requires the access key when one is configured', async () => {
    const secured = await setup({ apiKey: 'secret-key' });
    expect((await secured.call('GET', '/dashboard')).status).toBe(401);
    expect((await secured.call('GET', '/dashboard', undefined, { 'x-maada-key': 'secret-key' })).status).toBe(200);
  });

  it('limits rapid write requests', async () => {
    const limited = await setup({ writeRateLimit: 2 });
    for (let i = 0; i < 2; i++) expect((await limited.call('POST', '/donations', donation(100))).status).toBe(201);
    expect((await limited.call('POST', '/donations', donation(100))).status).toBe(429);
  });
});

describe('persistence, backup and demo data', () => {
  it('scenario 10: data survives closing and reopening the database', async () => {
    const { mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const dir = await mkdtemp(path.join(tmpdir(), 'maada-'));
    const { createPgliteDatabase } = await import('../server/db/pglite.js');
    const { migrate } = await import('../server/db/migrate.js');
    const { createApp } = await import('../server/app.js');
    const open = async () => { const db = await createPgliteDatabase(dir); await migrate(db); return { db, app: createApp(db, { writeRateLimit: 0 }) }; };
    const first = await open();
    const req = (app: any, method: string, p: string, body?: unknown) => app.request(`/api${p}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then((r: Response) => r.json());
    await req(first.app, 'PUT', '/settings/opening-balance', { amount: 5_000_000, date: '2026-04-01' });
    const created = await req(first.app, 'POST', '/donations', { ...donation(500_000), issue_receipt: true });
    await first.db.close();
    const second = await open();
    expect((await req(second.app, 'GET', '/dashboard')).balance).toBe(5_500_000);
    const receipt = await req(second.app, 'GET', `/receipts/${created.receipt.id}`);
    expect(receipt.item.receipt_number).toBe(created.receipt.receipt_number);
    await second.db.close();
  });

  it('backup and restore preserve all records and relationships', async () => {
    await t.ok('POST', '/admin/demo-data');
    const before = await t.ok('GET', '/dashboard');
    const backup = await t.ok('GET', '/backup');
    const check = await t.ok('POST', '/backup/validate', backup);
    expect(check.ok).toBe(true);
    const fresh = await setup();
    const denied = await fresh.call('POST', '/backup/restore', backup);
    expect(denied.status).toBe(400);
    const r = await fresh.call('POST', '/backup/restore', backup, { 'x-confirm-restore': 'REPLACE-ALL-DATA' });
    expect(r.status).toBe(200);
    expect((await fresh.ok('GET', '/dashboard')).balance).toBe(before.balance);
    expect((await fresh.ok('GET', '/admin/integrity')).ok).toBe(true);
    // Numbering continues after a restore instead of repeating.
    const next = await fresh.ok('POST', '/donations', { ...donation(100), issue_receipt: true });
    const numbers = (backup.tables.receipts as any[]).map((x) => x.receipt_number);
    expect(numbers).not.toContain(next.receipt.receipt_number);
  });

  it('rejects a tampered backup without changing anything', async () => {
    await t.ok('POST', '/admin/demo-data');
    const backup = await t.ok('GET', '/backup');
    backup.tables.transactions[0].amount = 1;
    const fresh = await setup();
    await fresh.ok('PUT', '/settings/opening-balance', { amount: 100, date: '2026-01-01' });
    const r = await fresh.call('POST', '/backup/restore', backup, { 'x-confirm-restore': 'REPLACE-ALL-DATA' });
    expect(r.status).toBe(422);
    expect(await fresh.balance()).toBe(100);
  });

  it('demo data can be removed completely', async () => {
    await t.ok('PUT', '/settings/opening-balance', { amount: 1_000_000, date: '2026-04-01' });
    await t.ok('POST', '/admin/demo-data');
    expect(await t.balance()).not.toBe(1_000_000);
    expect((await t.ok('GET', '/admin/integrity')).ok).toBe(true);
    await t.ok('DELETE', '/admin/demo-data');
    expect(await t.balance()).toBe(1_000_000);
    expect(await t.db.query('SELECT * FROM receipts')).toHaveLength(0);
  });
});
