import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Info, Trash2 } from 'lucide-react';
import { del, get, newId, post, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSave } from '../lib/forms';
import { useCategories, useEvents } from '../lib/data';
import { todayIST } from '../../shared/dates';
import { AmountInput, Button, ConfirmDialog, Field, IconButton, Select, Skeleton, TextArea, TextInput, useAmount } from '../components/ui';
import { Page } from '../components/Shell';

export default function IncomeForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { t } = useI18n();
  const categories = useCategories();
  const events = useEvents();
  const existing = useQuery({ queryKey: ['income', id], queryFn: () => get(`/incomes/${id}`), enabled: editing });
  const [recordId] = useState(newId);
  const [title, setTitle] = useState('');
  const amount = useAmount();
  const [date, setDate] = useState(todayIST());
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [eventId, setEventId] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const cats = (categories.data ?? []).filter((c) => c.category_type === 'income' && !['donation', 'ritual_payment', 'opening_balance'].includes(c.system_key ?? ''));
  useEffect(() => { if (!categoryId && cats.length && !editing) setCategoryId(cats[0].id); }, [cats, categoryId, editing]);
  useEffect(() => {
    const x = existing.data?.item;
    if (!x) return;
    setTitle(x.title); amount.reset(x.amount); setDate(x.income_date); setCategoryId(x.category_id); setFrom(x.received_from ?? '');
    setEventId(x.event_id ?? ''); setNotes(x.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);
  const valid = title.trim() && amount.paise && categoryId && date;
  const save = useSave(() => {
    const body = { title, amount: amount.paise, income_date: date, category_id: categoryId, received_from: from, event_id: eventId || null, notes };
    return editing ? put(`/incomes/${id}`, body) : post('/incomes', { ...body, id: recordId });
  }, { success: t('common.saved'), to: () => '/accounts' });
  const remove = useSave(() => del(`/incomes/${id}`), { success: t('common.deleted'), to: () => '/accounts' });
  if (editing && existing.isLoading) return <Page title={t('inc.edit')} back><Skeleton className="h-64 w-full" /></Page>;
  return (
    <Page title={editing ? t('inc.edit') : t('inc.new')} back
      actions={editing && <IconButton label={t('common.delete')} onClick={() => setConfirm(true)}><Trash2 className="size-5 text-expense" /></IconButton>}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (valid) save.mutate(undefined); }} className="flex flex-col gap-5">
        <p className="flex gap-2.5 rounded-2xl bg-sand px-4 py-3 text-[13px] leading-relaxed text-ink-soft"><Info className="mt-0.5 size-4 shrink-0 text-gold-ink" aria-hidden />{t('inc.hint')}</p>
        <Field label={t('inc.name')} htmlFor="i-title" hint={t('common.typeKnOrEn')} error={touched && !title.trim() ? `${t('inc.name')}?` : null}>
          <TextInput id="i-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('inc.namePlaceholder')} autoFocus={!editing} invalid={touched && !title.trim()} />
        </Field>
        <Field label={t('common.amount')} htmlFor="i-amt" error={touched && !amount.paise ? `${t('common.amount')}?` : null}>
          <AmountInput id="i-amt" value={amount.text} onChange={amount.set} invalid={touched && !amount.paise} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.date')} htmlFor="i-date"><TextInput id="i-date" type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={t('common.category')} htmlFor="i-cat">
            <Select id="i-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t('inc.from')} htmlFor="i-from" optional><TextInput id="i-from" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('common.event')} htmlFor="i-event" optional>
          <Select id="i-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">{t('common.none')}</option>
            {events.data?.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </Select>
        </Field>
        <Field label={t('common.notes')} htmlFor="i-notes" optional><TextArea id="i-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('common.notesPlaceholder')} /></Field>
        <Button type="submit" size="lg" block loading={save.isPending}>{t('inc.save')}</Button>
      </form>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t('inc.delete')} message={t('inc.deleteHint')}
        confirmLabel={t('common.delete')} loading={remove.isPending} onConfirm={() => remove.mutate(undefined)} />
    </Page>
  );
}
