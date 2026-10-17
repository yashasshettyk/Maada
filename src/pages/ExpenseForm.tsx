import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { del, get, newId, post, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSave } from '../lib/forms';
import { useCategories, useEvents } from '../lib/data';
import { todayIST } from '../../shared/dates';
import { AmountInput, Button, ConfirmDialog, Field, IconButton, Select, Skeleton, TextArea, TextInput, useAmount } from '../components/ui';
import { Page } from '../components/Shell';

/** Number at the start of a quantity like "4 bundles" or "2.5 kg". */
function leadingNumber(q: string): number | null {
  const m = q.trim().match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export default function ExpenseForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [params] = useSearchParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const categories = useCategories();
  const events = useEvents();
  const existing = useQuery({ queryKey: ['expense', id], queryFn: () => get(`/expenses/${id}`), enabled: editing });

  const [recordId, setRecordId] = useState(newId);
  const [title, setTitle] = useState('');
  const amount = useAmount();
  const rate = useAmount();
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(todayIST());
  const [categoryId, setCategoryId] = useState('');
  const [eventId, setEventId] = useState(params.get('event') ?? '');
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [autoAmount, setAutoAmount] = useState(true);

  const expenseCats = (categories.data ?? []).filter((c) => c.category_type === 'expense');
  useEffect(() => {
    if (!categoryId && expenseCats.length && !editing) setCategoryId((expenseCats.find((c) => c.name === 'Pooja Materials') ?? expenseCats[0]).id);
  }, [expenseCats, categoryId, editing]);
  useEffect(() => {
    const ev = events.data?.find((e) => e.id === eventId);
    if (ev && !editing) setDate(ev.event_date <= todayIST() ? ev.event_date : todayIST());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.data]);
  useEffect(() => {
    const x = existing.data?.item;
    if (!x) return;
    setTitle(x.title); amount.reset(x.amount); rate.reset(x.unit_rate); setQuantity(x.quantity ?? ''); setDate(x.expense_date);
    setCategoryId(x.category_id); setEventId(x.event_id ?? ''); setVendor(x.vendor ?? ''); setNotes(x.notes ?? ''); setAutoAmount(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  // Quantity × rate fills the amount until the amount is typed by hand.
  useEffect(() => {
    const n = leadingNumber(quantity);
    if (autoAmount && n != null && rate.paise != null) amount.reset(Math.round(n * rate.paise));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity, rate.paise, autoAmount]);

  const valid = title.trim() && amount.paise && categoryId && date;
  const body = () => ({
    title, amount: amount.paise, quantity, unit_rate: rate.paise, expense_date: date, category_id: categoryId,
    event_id: eventId || null, vendor, notes,
  });
  const backTo = () => (eventId ? `/events/${eventId}` : '/expenses');
  const save = useSave(() => (editing ? put(`/expenses/${id}`, body()) : post('/expenses', { ...body(), id: recordId })), {
    success: t('common.saved'), to: () => backTo(),
  });
  const saveAnother = useSave(() => post('/expenses', { ...body(), id: recordId }), {
    success: t('common.saved'),
    onDone: () => { setRecordId(newId()); setTitle(''); amount.reset(null); rate.reset(null); setQuantity(''); setVendor(''); setNotes(''); setTouched(false); setAutoAmount(true); },
  });
  const remove = useSave(() => del(`/expenses/${id}`), { success: t('common.deleted'), to: () => backTo() });

  const submit = (another: boolean) => {
    setTouched(true);
    if (!valid) return;
    (another ? saveAnother : save).mutate(undefined);
  };

  if (editing && existing.isLoading) return <Page title={t('exp.edit')} back><Skeleton className="h-72 w-full" /></Page>;
  return (
    <Page title={editing ? t('exp.edit') : t('exp.new')} back
      actions={editing && <IconButton label={t('common.delete')} onClick={() => setConfirm(true)}><Trash2 className="size-5 text-expense" /></IconButton>}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(false); }} className="flex flex-col gap-5">
        <Field label={t('exp.name')} htmlFor="x-title" hint={t('common.typeKnOrEn')} error={touched && !title.trim() ? `${t('exp.name')}?` : null}>
          <TextInput id="x-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('exp.namePlaceholder')} autoFocus={!editing} invalid={touched && !title.trim()} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('exp.quantity')} htmlFor="x-qty" optional>
            <TextInput id="x-qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={t('exp.quantityPlaceholder')} />
          </Field>
          <Field label={t('exp.rate')} htmlFor="x-rate" optional>
            <AmountInput id="x-rate" value={rate.text} onChange={rate.set} />
          </Field>
        </div>
        <Field label={t('common.amount')} htmlFor="x-amt" error={touched && !amount.paise ? `${t('common.amount')}?` : null}
          hint={autoAmount && leadingNumber(quantity) != null && rate.paise != null ? t('exp.calc') : undefined}>
          <AmountInput id="x-amt" value={amount.text} onChange={(txt, p) => { setAutoAmount(false); amount.set(txt, p); }} invalid={touched && !amount.paise} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.date')} htmlFor="x-date"><TextInput id="x-date" type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={t('common.category')} htmlFor="x-cat">
            <Select id="x-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t('common.event')} htmlFor="x-event" optional>
          <Select id="x-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">{t('exp.noEvent')}</option>
            {events.data?.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </Select>
        </Field>
        <Field label={t('exp.vendor')} htmlFor="x-vendor" optional>
          <TextInput id="x-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder={t('exp.vendorPlaceholder')} />
        </Field>
        <Field label={t('common.notes')} htmlFor="x-notes" optional><TextArea id="x-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('common.notesPlaceholder')} /></Field>
        <div className="flex flex-col gap-2.5">
          <Button type="submit" size="lg" block loading={save.isPending}>{t('exp.save')}</Button>
          {!editing && <Button type="button" variant="secondary" block loading={saveAnother.isPending} onClick={() => submit(true)}>{t('exp.saveAndAdd')}</Button>}
          {!editing && eventId && <Button type="button" variant="ghost" onClick={() => navigate(`/events/${eventId}`)}>{t('common.done')}</Button>}
        </div>
      </form>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t('exp.delete')} message={t('exp.deleteHint')}
        confirmLabel={t('common.delete')} loading={remove.isPending} onConfirm={() => remove.mutate(undefined)} />
    </Page>
  );
}
