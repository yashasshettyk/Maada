import type { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { Database } from '../db/types.js';
import { todayIST } from '../../shared/dates.js';

/** Load realistic sample records through the real API so every rule (ledger, receipts) applies. */
export async function seedDemo(app: Hono, db: Database, headers: Record<string, string> = {}) {
  const today = todayIST();
  const day = (offset: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`/api${path}`, {
      method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as any;
    if (!res.ok) throw new Error(`${method} ${path}: ${json?.error?.message ?? res.status}`);
    return json;
  };
  const cats = (await call('GET', '/categories')).items as any[];
  const cat = (name: string) => cats.find((c) => c.name === name).id;
  const sankranti = ((await call('GET', '/rituals')).items as any[]).find((r) => r.name === 'Sankranti Seve').id;
  const ids = { events: [] as string[], donations: [] as string[], entries: [] as string[], expenses: [] as string[], incomes: [] as string[] };

  const ev = randomUUID();
  await call('POST', '/events', { id: ev, name: 'Sankranti Seve — this month', event_date: day(2), description: 'Monthly Sankranti Seve' });
  ids.events.push(ev);

  for (const [name, amount, purpose, offset] of [
    ['ಯಶಸ್ ಶೆಟ್ಟಿ', 500000, 'ಮಾಡದ ಅಭಿವೃದ್ಧಿ ಮತ್ತು ದೇವಾಲಯ ನಿರ್ವಹಣೆಗಾಗಿ', 1],
    ['Prakash Shetty', 250000, 'Temple maintenance', 6],
    ['Sujatha Bhandary', 100100, 'General donation', 12],
  ] as const) {
    const id = randomUUID();
    await call('POST', '/donations', { id, donor_name: name, donation_date: day(offset), amount, purpose, payment_method: 'Cash', issue_receipt: true });
    ids.donations.push(id);
  }

  for (const [name, amount, offset] of [['ರಮೇಶ್ ಪೂಜಾರಿ', 50000, 2], ['Ganesh Rai', 50000, 2], ['Lakshmi Acharya', 100000, 2]] as const) {
    const id = randomUUID();
    await call('POST', '/ritual-entries', {
      id, ritual_id: sankranti, devotee_name: name, ritual_date: day(offset), prescribed_amount: amount, event_id: ev,
      initial_payment: { id: randomUUID(), amount, payment_date: day(offset) }, issue_receipt: true,
    });
    ids.entries.push(id);
  }
  const partial = randomUUID();
  await call('POST', '/ritual-entries', {
    id: partial, ritual_id: sankranti, devotee_name: 'Sudha Kamath', ritual_date: day(-28), prescribed_amount: 200000,
    initial_payment: { id: randomUUID(), amount: 100000, payment_date: day(0) }, issue_receipt: true,
  });
  ids.entries.push(partial);

  for (const [title, vendor, quantity, rate, amount, category] of [
    ['Jasmine flowers', 'Flower market', '4 bundles', 25000, 100000, 'Flowers'],
    ['Areca flowers (Hingara)', null, '6 nos', 6000, 36000, 'Flowers'],
    ['Bananas', null, '2 bunches', 45000, 90000, 'Fruits'],
    ['Coconuts', null, '25 nos', 3500, 87500, 'Pooja Materials'],
    ['Rice', 'Grocery store', '10 kg', 6000, 60000, 'Food & Refreshments'],
    ['Lamp oil & wicks', null, '2 L', 18000, 36000, 'Pooja Materials'],
  ] as const) {
    const id = randomUUID();
    await call('POST', '/expenses', { id, title, vendor, quantity, unit_rate: rate, amount, category_id: cat(category), expense_date: day(2), event_id: ev });
    ids.expenses.push(id);
  }
  const roof = randomUUID();
  await call('POST', '/expenses', { id: roof, title: 'Roof tile repair', amount: 200000, category_id: cat('Temple Maintenance'), expense_date: day(9) });
  ids.expenses.push(roof);
  const hundi = randomUUID();
  await call('POST', '/incomes', { id: hundi, title: 'Hundi collection', amount: 1240000, category_id: cat('Hundi Collection'), income_date: day(4) });
  ids.incomes.push(hundi);

  await db.tx(async (q) => {
    await q.query('UPDATE events SET is_demo = true WHERE id = ANY($1::uuid[])', [ids.events]);
    await q.query('UPDATE donations SET is_demo = true WHERE id = ANY($1::uuid[])', [ids.donations]);
    await q.query('UPDATE ritual_entries SET is_demo = true WHERE id = ANY($1::uuid[])', [ids.entries]);
    await q.query('UPDATE expenses SET is_demo = true WHERE id = ANY($1::uuid[])', [ids.expenses]);
    await q.query('UPDATE incomes SET is_demo = true WHERE id = ANY($1::uuid[])', [ids.incomes]);
    await q.query(`UPDATE receipts SET is_demo = true WHERE
      (source_type = 'donation' AND source_id = ANY($1::uuid[]))
      OR (source_type = 'ritual_payment' AND source_id IN (SELECT id FROM ritual_payments WHERE ritual_entry_id = ANY($2::uuid[])))`,
    [ids.donations, ids.entries]);
  });
  return ids;
}
