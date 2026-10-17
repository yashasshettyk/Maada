import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, newId, post, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSave } from '../lib/forms';
import { useEvents, useSettings } from '../lib/data';
import { todayIST } from '../../shared/dates';
import { amountInKannadaWords } from '../../shared/words-kn';
import { amountInWords } from '../../shared/words';
import { kn } from '../lib/strings';
import { AmountInput, Button, Card, Field, Select, Skeleton, TextArea, TextInput, Toggle, useAmount } from '../components/ui';
import { Page } from '../components/Shell';
import { MethodSelect } from '../components/MethodSelect';
import clsx from 'clsx';

const PURPOSES = ['development', 'maintenance', 'ritual', 'festival', 'general'] as const;

export default function DonationForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { t, lang } = useI18n();
  const settings = useSettings();
  const events = useEvents();
  const existing = useQuery({ queryKey: ['donation', id], queryFn: () => get(`/donations/${id}`), enabled: editing });

  const [recordId] = useState(newId);
  const amount = useAmount();
  const [donor, setDonor] = useState('');
  const [date, setDate] = useState(todayIST());
  const [method, setMethod] = useState('Cash');
  const [purpose, setPurpose] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [eventId, setEventId] = useState('');
  const [receipt, setReceipt] = useState(true);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (settings.data) setReceipt(settings.data.settings.offer_receipt_after_save);
  }, [settings.data]);
  useEffect(() => {
    const d = existing.data?.item;
    if (!d) return;
    amount.reset(d.amount);
    setDonor(d.donor_name); setDate(d.donation_date); setMethod(d.payment_method ?? 'Cash'); setPurpose(d.purpose);
    setReference(d.reference_number ?? ''); setNotes(d.notes ?? ''); setEventId(d.event_id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const errors = {
    amount: !amount.paise ? t('don.amount') : null,
    donor: !donor.trim() ? t('don.donor') : null,
    purpose: !purpose.trim() ? t('don.purpose') : null,
  };
  const valid = !errors.amount && !errors.donor && !errors.purpose && Boolean(date);

  const save = useSave(
    () => {
      const body = {
        donor_name: donor, donation_date: date, amount: amount.paise, purpose, payment_method: method,
        reference_number: reference, notes, event_id: eventId || null,
      };
      return editing ? put(`/donations/${id}`, body) : post('/donations', { ...body, id: recordId, issue_receipt: receipt });
    },
    {
      success: t('common.saved'),
      to: (r: any) => (r.receipt && (!editing || r.receipt.id !== existing.data?.receipts?.[0]?.id) ? `/receipts/${r.receipt.id}` : `/donations/${editing ? id : r.item.id}`),
    },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (valid) save.mutate(undefined);
  };

  if (editing && existing.isLoading) return <Page title={t('don.edit')} back><Skeleton className="h-64 w-full" /></Page>;

  return (
    <Page title={editing ? t('don.edit') : t('don.new')} back>
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-1.5 pt-2">
          <label htmlFor="d-amount" className="text-[13px] font-bold text-ink-soft">{t('don.amount')}</label>
          <AmountInput id="d-amount" large autoFocus={!editing} value={amount.text} onChange={amount.set} invalid={touched && !!errors.amount} />
          <p className="min-h-5 px-4 text-center text-[13px] text-muted">
            {amount.paise ? (lang === 'kn' ? amountInKannadaWords(amount.paise) : amountInWords(amount.paise)) : ''}
          </p>
        </div>

        <Field label={t('don.donor')} htmlFor="d-donor" hint={t('common.typeKnOrEn')} error={touched ? errors.donor && `${t('don.donor')}?` : null}>
          <TextInput id="d-donor" value={donor} onChange={(e) => setDonor(e.target.value)} placeholder={t('don.donorPlaceholder')} autoComplete="name" invalid={touched && !!errors.donor} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.date')} htmlFor="d-date"><TextInput id="d-date" type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={t('common.paymentMethod')} htmlFor="d-method"><MethodSelect id="d-method" value={method} onChange={setMethod} /></Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 px-0.5 text-[13px] font-bold text-ink-soft">{t('don.purpose')}</legend>
          <div className="flex flex-wrap gap-2">
            {PURPOSES.map((p) => {
              const value = kn[`don.purpose.${p}`];
              const active = purpose === value;
              return (
                <button type="button" key={p} onClick={() => setPurpose(value)} aria-pressed={active}
                  className={clsx('h-10 rounded-full px-3.5 text-[13px]', active ? 'bg-maroon font-bold text-white' : 'bg-beige font-semibold text-[#3d3936]')}>
                  {t(`don.purpose.${p}`)}
                </button>
              );
            })}
          </div>
          <TextInput aria-label={t('don.purpose')} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={t('don.purposePlaceholder')} invalid={touched && !!errors.purpose} />
          {touched && errors.purpose && <p className="px-0.5 text-[13px] font-semibold text-expense">{t('don.purposePlaceholder')}</p>}
        </fieldset>

        <Field label={t('common.reference')} htmlFor="d-ref" optional>
          <TextInput id="d-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('common.referencePlaceholder')} />
        </Field>
        {(events.data?.length ?? 0) > 0 && (
          <Field label={t('common.event')} htmlFor="d-event" optional>
            <Select id="d-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">{t('common.none')}</option>
              {events.data!.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('common.notes')} htmlFor="d-notes" optional>
          <TextArea id="d-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('common.notesPlaceholder')} />
        </Field>

        {!editing && <Card className="!bg-sand !shadow-none"><Toggle checked={receipt} onChange={setReceipt} label={t('rcpt.generateAfterSave')} /></Card>}
        <Button type="submit" size="lg" block loading={save.isPending}>{save.isPending ? t('common.saving') : t('don.save')}</Button>
      </form>
    </Page>
  );
}
