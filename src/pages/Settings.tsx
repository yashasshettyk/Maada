import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, FileUp, Languages, Pencil, Plus, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react';
import { ApiError, api, del, get, getServer, patch, post, put } from '../lib/api';
import { ServerForm } from '../components/ServerConnect';
import { useI18n } from '../lib/i18n';
import { useCategories, useInvalidateMoney, useRituals, useSettings, type Ritual, type Settings as S } from '../lib/data';
import { todayIST } from '../../shared/dates';
import { AmountInput, Badge, Button, Card, ConfirmDialog, Eyebrow, Field, List, ListRow, Segmented, Select, Sheet, Skeleton, TextArea, TextInput, Toggle, useAmount, useToast } from '../components/ui';
import { Page } from '../components/Shell';
import { downloadText, saveFile } from '../lib/native';
import { toCsv } from '../receipts/reportPdf';
import { paiseToInput } from '../../shared/money';

function Section({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-2">
      <Eyebrow>{title}</Eyebrow>
      {hint && <p className="px-1 text-[13px] leading-relaxed text-muted">{hint}</p>}
      {children}
    </section>
  );
}

function useApiAction() {
  const toast = useToast();
  return async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    try {
      const r = await fn();
      if (ok) toast(ok);
      return r;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : (e as Error).message, 'error');
    }
  };
}

function OpeningBalance() {
  const { t } = useI18n();
  const settings = useSettings();
  const invalidate = useInvalidateMoney();
  const qc = useQueryClient();
  const run = useApiAction();
  const amount = useAmount();
  const [date, setDate] = useState(todayIST());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const o = settings.data?.opening_balance;
    if (o) { amount.reset(o.amount); setDate(o.date); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data?.opening_balance]);
  const save = async () => {
    setBusy(true);
    await run(() => put('/settings/opening-balance', { amount: amount.paise, date, description: 'Opening balance' }), t('set.openingSaved'));
    setBusy(false);
    invalidate();
    qc.invalidateQueries({ queryKey: ['settings'] });
  };
  return (
    <Section id="opening" title={t('set.opening')} hint={t('set.openingHint')}>
      <Card className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.amount')} htmlFor="ob-amt"><AmountInput id="ob-amt" value={amount.text} onChange={amount.set} /></Field>
          <Field label={t('set.openingDate')} htmlFor="ob-date"><TextInput id="ob-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Button disabled={amount.paise == null || !date} loading={busy} onClick={save}>{t('common.save')}</Button>
      </Card>
    </Section>
  );
}

function ReceiptWording({ s }: { s: S }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const run = useApiAction();
  const [form, setForm] = useState(s);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(s), [s]);
  const set = (k: keyof S) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const fields: [keyof S, string, boolean?][] = [
    ['institution_name_kn', t('set.institutionKn')],
    ['donation_title_kn', t('set.donationTitle')],
    ['bill_title_kn', t('set.billTitle')],
    ['donation_ack_kn', t('set.donationAck'), true],
    ['seve_ack_kn', t('set.seveAck'), true],
    ['receipt_footer_kn', t('set.footer')],
    ['institution_name', t('set.institutionEn')],
  ];
  const save = async () => {
    setBusy(true);
    const body = Object.fromEntries([...fields.map(([k]) => k), 'donation_prefix', 'seve_prefix', 'bill_prefix'].map((k) => [k, form[k as keyof S]]));
    await run(() => put('/settings', body), t('set.saved'));
    qc.invalidateQueries({ queryKey: ['settings'] });
    setBusy(false);
  };
  return (
    <Section id="receipt" title={t('set.receiptText')} hint={t('set.receiptTextHint')}>
      <Card className="flex flex-col gap-4 p-4">
        {fields.map(([k, label, long]) => (
          <Field key={k} label={label} htmlFor={`rw-${k}`}>
            {long ? <TextArea id={`rw-${k}`} value={String(form[k])} onChange={set(k)} /> : <TextInput id={`rw-${k}`} value={String(form[k])} onChange={set(k)} />}
          </Field>
        ))}
        <div className="flex flex-col gap-2">
          <span className="px-0.5 text-[13px] font-bold text-ink-soft">{t('set.prefixes')}</span>
          <div className="grid grid-cols-3 gap-2.5">
            {(['donation_prefix', 'seve_prefix', 'bill_prefix'] as const).map((k) => (
              <Field key={k} label={t(k === 'donation_prefix' ? 'set.donationPrefix' : k === 'seve_prefix' ? 'set.sevePrefix' : 'set.billPrefix')} htmlFor={`rw-${k}`}>
                <TextInput id={`rw-${k}`} value={form[k]} maxLength={12} onChange={set(k)} />
              </Field>
            ))}
          </div>
          <p className="px-0.5 text-xs text-muted">{t('set.prefixHint', { example: `${form.donation_prefix}-${todayIST().slice(0, 4)}-00001` })}</p>
        </div>
        <Button loading={busy} onClick={save}>{t('common.save')}</Button>
      </Card>
    </Section>
  );
}

function Preferences({ s }: { s: S }) {
  const { t, lang, setLang } = useI18n();
  const qc = useQueryClient();
  const run = useApiAction();
  const update = async (body: Partial<S>) => {
    qc.setQueryData(['settings'], (old: any) => old && { ...old, settings: { ...old.settings, ...body } });
    await run(() => put('/settings', body));
    qc.invalidateQueries({ queryKey: ['settings'] });
  };
  return (
    <>
      <Section title={t('set.language')}>
        <Card className="flex items-center gap-3 px-4 py-3">
          <Languages className="size-5 text-gold-ink" aria-hidden />
          <span className="flex-1 text-[15px] font-semibold">{t('more.language')}</span>
          <Segmented label={t('set.language')} value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'kn', label: 'ಕನ್ನಡ' }]} />
        </Card>
      </Section>
      <Section title={t('set.payments')}>
        <Card as="div" className="divide-y divide-[#f1ebdf]">
          <Toggle checked={s.offer_receipt_after_save} onChange={(v) => update({ offer_receipt_after_save: v })} label={t('set.offerReceipt')} />
          <Toggle checked={s.allow_overpayment} onChange={(v) => update({ allow_overpayment: v })} label={t('set.allowOverpay')} />
          <div className="flex items-center gap-3 px-4 py-3">
            <label htmlFor="df" className="flex-1 text-[15px] font-semibold">{t('set.dateFormat')}</label>
            <Select id="df" value={s.date_format} onChange={(e) => update({ date_format: e.target.value as S['date_format'] })} className="!h-11 !w-auto !text-sm">
              <option value="DD MMM YYYY">16 Oct 2026</option>
              <option value="DD/MM/YYYY">16/10/2026</option>
              <option value="YYYY-MM-DD">2026-10-16</option>
            </Select>
          </div>
        </Card>
      </Section>
    </>
  );
}

function SeveTypes() {
  const { t } = useI18n();
  const rituals = useRituals();
  const qc = useQueryClient();
  const run = useApiAction();
  const [editing, setEditing] = useState<Ritual | 'new' | null>(null);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const amount = useAmount();
  const [busy, setBusy] = useState(false);
  const open = (r: Ritual | 'new') => {
    setEditing(r);
    setName(r === 'new' ? '' : r.name);
    setTitle(r === 'new' ? '' : r.receipt_title ?? '');
    amount.reset(r === 'new' ? null : r.default_amount);
  };
  const save = async () => {
    setBusy(true);
    const body = { name, receipt_title: title, default_amount: amount.paise };
    const ok = await run(() => (editing === 'new' ? post('/rituals', body) : put(`/rituals/${(editing as Ritual).id}`, body)), t('common.saved'));
    setBusy(false);
    if (ok) { setEditing(null); qc.invalidateQueries({ queryKey: ['rituals'] }); }
  };
  const remove = async () => {
    setBusy(true);
    const ok = await run(() => del(`/rituals/${(editing as Ritual).id}`), t('common.deleted'));
    setBusy(false);
    if (ok) { setEditing(null); qc.invalidateQueries({ queryKey: ['rituals'] }); }
  };
  return (
    <Section id="seves" title={t('set.seveTypes')}>
      <List>
        {rituals.data?.map((r) => (
          <ListRow key={r.id} onClick={() => open(r)} title={r.name} subtitle={[r.receipt_title, r.default_amount ? `₹${paiseToInput(r.default_amount)}` : null].filter(Boolean).join(' · ')}
            trailing={<Pencil className="size-4 text-muted" aria-hidden />} />
        ))}
        <ListRow onClick={() => open('new')} icon={<Plus className="size-5 text-maroon" />} title={<span className="text-maroon">{t('seve.addType')}</span>} />
      </List>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? t('seve.addType') : t('seve.types')}>
        <div className="flex flex-col gap-4">
          <Field label={t('seve.typeName')} htmlFor="st-name"><TextInput id="st-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('seve.typeNamePlaceholder')} /></Field>
          <Field label={t('seve.receiptTitle')} htmlFor="st-title"><TextInput id="st-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('seve.receiptTitlePlaceholder')} /></Field>
          <Field label={t('seve.defaultAmount')} htmlFor="st-amt" optional><AmountInput id="st-amt" value={amount.text} onChange={amount.set} /></Field>
          <Button block disabled={!name.trim()} loading={busy} onClick={save}>{t('common.save')}</Button>
          {editing !== 'new' && editing && editing.entry_count === 0 && (
            <Button variant="danger" icon={<Trash2 className="size-5" />} loading={busy} onClick={remove}>{t('common.delete')}</Button>
          )}
        </div>
      </Sheet>
    </Section>
  );
}

function Categories() {
  const { t } = useI18n();
  const categories = useCategories();
  const qc = useQueryClient();
  const run = useApiAction();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [editing, setEditing] = useState<{ id?: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['categories'] });
  const save = async () => {
    if (!editing) return;
    const ok = await run(() => (editing.id ? patch(`/categories/${editing.id}`, { name: editing.name }) : post('/categories', { name: editing.name, category_type: type })), t('common.saved'));
    if (ok) { setEditing(null); refresh(); }
  };
  const remove = async () => {
    if (!editing?.id) return;
    const ok = await run(() => del(`/categories/${editing.id}`), t('common.deleted'));
    setConfirmDelete(false);
    if (ok) { setEditing(null); refresh(); }
  };
  const list = (categories.data ?? []).filter((c) => c.category_type === type);
  return (
    <Section title={t('set.categories')}>
      <Segmented label={t('set.categories')} value={type} onChange={setType} options={[{ value: 'expense', label: t('set.expenseCats') }, { value: 'income', label: t('set.incomeCats') }]} />
      <List>
        {list.map((c) => (
          <ListRow key={c.id} onClick={c.system_key ? undefined : () => setEditing({ id: c.id, name: c.name })} title={c.name}
            trailing={c.system_key ? <Badge>{t('set.builtIn')}</Badge> : <Pencil className="size-4 text-muted" aria-hidden />} />
        ))}
        <ListRow onClick={() => setEditing({ name: '' })} icon={<Plus className="size-5 text-maroon" />} title={<span className="text-maroon">{t('set.addCategory')}</span>} />
      </List>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t('common.edit') : t('set.addCategory')}>
        <div className="flex flex-col gap-4">
          <Field label={t('set.categoryName')} htmlFor="cat-name"><TextInput id="cat-name" value={editing?.name ?? ''} onChange={(e) => setEditing((x) => x && { ...x, name: e.target.value })} /></Field>
          <Button block disabled={!editing?.name.trim()} onClick={save}>{t('common.save')}</Button>
          {editing?.id && <Button variant="danger" icon={<Trash2 className="size-5" />} onClick={() => setConfirmDelete(true)}>{t('common.delete')}</Button>}
        </div>
      </Sheet>
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('common.confirmDelete')} confirmLabel={t('common.delete')} onConfirm={remove} />
    </Section>
  );
}

function DataTools() {
  const { t } = useI18n();
  const toast = useToast();
  const run = useApiAction();
  const invalidate = useInvalidateMoney();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ data: unknown; counts: Record<string, number> } | null>(null);
  const [problems, setProblems] = useState<string[] | null>(null);
  const demo = useQuery({ queryKey: ['demo-present'], queryFn: () => get<{ present: boolean }>('/admin/demo-data') });

  const backup = async () => {
    setBusy('backup');
    await run(async () => {
      const data = await get('/backup');
      const where = await saveFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), `maada-backup-${todayIST()}.json`);
      toast(t('rcpt.savedTo', { place: where }));
    });
    setBusy(null);
  };
  const exportCsv = async () => {
    setBusy('csv');
    await run(async () => {
      const rows: (string | number)[][] = [];
      for (let page = 1; page < 500; page++) {
        const r = await get(`/transactions?page=${page}&pageSize=100`);
        for (const x of r.items) rows.push([x.transaction_date, x.transaction_type, x.source_type, x.description, x.category_name ?? '', x.event_name ?? '', x.party_name ?? '', paiseToInput(x.amount), x.receipt_number ?? '']);
        if (page * 100 >= r.totals.count) break;
      }
      const where = await downloadText(toCsv(['date', 'type', 'source', 'description', 'category', 'event', 'party', 'amount_inr', 'receipt'], rows), `maada-accounts-${todayIST()}.csv`);
      toast(t('rcpt.savedTo', { place: where }));
    });
    setBusy(null);
  };
  const pick = async (file: File) => {
    setProblems(null);
    try {
      const data = JSON.parse(await file.text());
      const res = await post('/backup/validate', data);
      if (res.ok) setPending({ data, counts: res.counts });
      else setProblems(res.problems);
    } catch (e) {
      setProblems([e instanceof ApiError ? e.message : 'This file is not a valid Maada backup.']);
    }
  };
  const restore = async () => {
    if (!pending) return;
    setBusy('restore');
    const ok = await run(() => api('/backup/restore', { method: 'POST', json: pending.data, headers: { 'x-confirm-restore': 'REPLACE-ALL-DATA' } }), t('set.restored'));
    setBusy(null);
    if (ok) { setPending(null); qc.invalidateQueries(); }
  };
  const demoAction = async (load: boolean) => {
    setBusy('demo');
    await run(() => (load ? post('/admin/demo-data') : del('/admin/demo-data')), load ? t('set.demoLoaded') : t('set.demoRemoved'));
    setBusy(null);
    invalidate();
    qc.invalidateQueries({ queryKey: ['demo-present'] });
  };
  const integrity = async () => {
    setBusy('check');
    const r = await run(() => get('/admin/integrity'));
    if (r) toast(r.ok ? t('set.integrityOk') : t('set.integrityBad'), r.ok ? 'ok' : 'error');
    setBusy(null);
  };
  const total = pending ? Object.values(pending.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <>
      <Section title={t('set.data')}>
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-[13px] leading-relaxed text-muted">{t('set.backupHint')}</p>
          <Button variant="secondary" icon={<DatabaseBackup className="size-5" />} loading={busy === 'backup'} onClick={backup}>{t('set.backup')}</Button>
          <Button variant="secondary" icon={<FileUp className="size-5" />} loading={busy === 'csv'} onClick={exportCsv}>{t('set.exportCsv')}</Button>
          <div className="my-1 h-px bg-line" />
          <p className="text-[13px] leading-relaxed text-muted">{t('set.restoreHint')}</p>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label={t('set.restore')}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
          <Button variant="secondary" icon={<Upload className="size-5" />} onClick={() => fileRef.current?.click()}>{t('set.restore')}</Button>
          {problems && (
            <div role="alert" className="rounded-xl bg-expense-bg p-3 text-[13px] text-[#7a2c2c]">
              <p className="font-bold">{t('set.restoreProblems')}</p>
              <ul className="mt-1 list-disc pl-5">{problems.slice(0, 8).map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          <Button variant="ghost" icon={<ShieldCheck className="size-5" />} loading={busy === 'check'} onClick={integrity}>{t('set.integrity')}</Button>
        </Card>
      </Section>
      <Section title={t('set.demo')} hint={t('set.demoHint')}>
        <Card className="p-4">
          {demo.data?.present ? (
            <Button block variant="danger" icon={<Trash2 className="size-5" />} loading={busy === 'demo'} onClick={() => demoAction(false)}>{t('set.demoRemove')}</Button>
          ) : (
            <Button block variant="secondary" icon={<Sparkles className="size-5" />} loading={busy === 'demo'} onClick={() => demoAction(true)}>{t('set.demoLoad')}</Button>
          )}
        </Card>
      </Section>
      <ConfirmDialog open={!!pending} onClose={() => setPending(null)} title={t('set.restoreConfirm')}
        message={`${t('set.restoreCheck', { n: total })} ${t('common.cannotUndo')}`} confirmLabel={t('set.restore')}
        loading={busy === 'restore'} onConfirm={restore} />
    </>
  );
}

function ServerSection() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const url = getServer().url || window.location.origin;
  return (
    <Section id="server" title={t('srv.section')}>
      <Card className="flex items-center justify-between gap-3 p-4">
        <span className="min-w-0 truncate text-[13px] font-semibold text-ink-soft">{url}</span>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{t('srv.change')}</Button>
      </Card>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('srv.section')}>
        <ServerForm onDone={() => { setOpen(false); toast(t('srv.connected')); qc.invalidateQueries(); }} />
      </Sheet>
    </Section>
  );
}

export default function Settings() {
  const { t } = useI18n();
  const settings = useSettings();
  const location = useLocation();
  useEffect(() => {
    if (location.hash && settings.data) {
      setTimeout(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }, [location.hash, settings.data]);
  const s = settings.data?.settings;
  return (
    <Page title={t('set.title')} back>
      {!s ? <Skeleton className="h-96 w-full" /> : (
        <>
          <Preferences s={s} />
          <OpeningBalance />
          <ReceiptWording s={s} />
          <SeveTypes />
          <Categories />
          <DataTools />
          <ServerSection />
          <Section title={t('set.about')}>
            <Card className="flex flex-col gap-1 p-4 text-[13px] text-muted">
              <span className="font-bold text-ink">{s.institution_name}</span>
              <span>v1.0.0</span>
            </Card>
          </Section>
        </>
      )}
    </Page>
  );
}
