import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, newId, post, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSave } from '../lib/forms';
import { useEvents, useRituals, useSettings } from '../lib/data';
import { todayIST } from '../../shared/dates';
import { AmountInput, Button, Card, Field, Select, Skeleton, TextArea, TextInput, Toggle, useAmount } from '../components/ui';
import { ReceiptNumberField } from '../components/ReceiptNumber';
import { Page } from '../components/Shell';
import { MethodSelect } from '../components/MethodSelect';
import { RitualSelect } from '../components/RitualSelect';

export default function SeveForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { t } = useI18n();
  const rituals = useRituals();
  const events = useEvents();
  const settings = useSettings();
  const existing = useQuery({ queryKey: ['ritual-entry', id], queryFn: () => get(`/ritual-entries/${id}`), enabled: editing });

  const [ids] = useState(() => ({ entry: newId(), payment: newId() }));
  const [ritualId, setRitualId] = useState('');
  const [devotee, setDevotee] = useState('');
  const [date, setDate] = useState(todayIST());
  const prescribed = useAmount();
  const paidNow = useAmount();
  const [method, setMethod] = useState('Cash');
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');
  const [eventId, setEventId] = useState('');
  const [receipt, setReceipt] = useState(true);
  const [receiptNo, setReceiptNo] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => { if (settings.data) setReceipt(settings.data.settings.offer_receipt_after_save); }, [settings.data]);
  useEffect(() => {
    if (!editing && !ritualId && rituals.data?.length) {
      const r = rituals.data.find((x) => x.name === 'Sankranti Seve') ?? rituals.data[0];
      setRitualId(r.id);
      if (r.default_amount) prescribed.reset(r.default_amount);
    }
  }, [editing, rituals.data, ritualId, prescribed]);
  useEffect(() => {
    const e = existing.data?.item;
    if (!e) return;
    setRitualId(e.ritual_id); setDevotee(e.devotee_name); setDate(e.ritual_date); prescribed.reset(e.prescribed_amount);
    setContact(e.contact ?? ''); setNotes(e.notes ?? ''); setEventId(e.event_id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing.data]);

  const paidTooMuch = !settings.data?.settings.allow_overpayment && paidNow.paise != null && prescribed.paise != null && paidNow.paise > prescribed.paise;
  const valid = ritualId && devotee.trim() && prescribed.paise != null && date && !paidTooMuch && (paidNow.text === '' || paidNow.paise) && (editing || !receipt || !paidNow.paise || receiptNo.trim());

  const save = useSave(() => {
    const body = { ritual_id: ritualId, devotee_name: devotee, ritual_date: date, prescribed_amount: prescribed.paise, contact, notes, event_id: eventId || null };
    if (editing) return put(`/ritual-entries/${id}`, body);
    return post('/ritual-entries', {
      ...body, id: ids.entry,
      initial_payment: paidNow.paise ? { id: ids.payment, amount: paidNow.paise, payment_date: todayIST(), payment_method: method } : null,
      issue_receipt: receipt,
      receipt_number: receipt && paidNow.paise ? receiptNo.trim() : null,
    });
  }, { success: t('common.saved'), to: (r: any) => (r.receipt ? `/receipts/${r.receipt.id}` : `/seves/${editing ? id : ids.entry}`) });

  if (editing && existing.isLoading) return <Page title={t('seve.entry')} back><Skeleton className="h-64 w-full" /></Page>;
  return (
    <Page title={editing ? t('seve.entry') : t('seve.new')} back>
      <form noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (valid) save.mutate(undefined); }} className="flex flex-col gap-5">
        <Field label={t('seve.seve')} htmlFor="s-ritual">
          <RitualSelect id="s-ritual" rituals={rituals.data ?? []} value={ritualId} onChange={(r) => { setRitualId(r?.id ?? ''); if (!editing && r?.default_amount) prescribed.reset(r.default_amount); }} />
        </Field>
        <Field label={t('seve.devotee')} htmlFor="s-name" hint={t('common.typeKnOrEn')} error={touched && !devotee.trim() ? `${t('seve.devotee')}?` : null}>
          <TextInput id="s-name" value={devotee} onChange={(e) => setDevotee(e.target.value)} placeholder={t('seve.devoteePlaceholder')} invalid={touched && !devotee.trim()} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('seve.date')} htmlFor="s-date"><TextInput id="s-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={t('seve.prescribed')} htmlFor="s-amt" error={touched && prescribed.paise == null ? t('seve.prescribedHint') : null}>
            <AmountInput id="s-amt" value={prescribed.text} onChange={prescribed.set} invalid={touched && prescribed.paise == null} />
          </Field>
        </div>
        {!editing && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('seve.paidNow')} htmlFor="s-paid" error={paidTooMuch ? t('seve.prescribedHint') : null} hint={t('seve.paidNowHint')}>
                <AmountInput id="s-paid" value={paidNow.text} onChange={paidNow.set} invalid={paidTooMuch} />
              </Field>
              <Field label={t('common.paymentMethod')} htmlFor="s-method"><MethodSelect id="s-method" value={method} onChange={setMethod} /></Field>
            </div>
            {prescribed.paise ? (
              <button type="button" onClick={() => paidNow.reset(prescribed.paise)} className="-mt-3 self-start px-1 text-sm font-bold text-maroon">
                {t('seve.paidNow')} = {t('seve.prescribed')}
              </button>
            ) : null}
          </>
        )}
        <Field label={t('seve.contact')} htmlFor="s-contact" optional>
          <TextInput id="s-contact" type="tel" inputMode="tel" value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        {(events.data?.length ?? 0) > 0 && (
          <Field label={t('seve.linkEvent')} htmlFor="s-event" optional>
            <Select id="s-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">{t('common.none')}</option>
              {events.data!.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t('common.notes')} htmlFor="s-notes" optional><TextArea id="s-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('common.notesPlaceholder')} /></Field>
        {!editing && paidNow.paise ? <Card className="!bg-sand !shadow-none"><Toggle checked={receipt} onChange={setReceipt} label={t('rcpt.generateAfterSave')} /></Card> : null}
        {!editing && paidNow.paise && receipt ? <ReceiptNumberField id="s-rno" value={receiptNo} onChange={setReceiptNo} touched={touched} /> : null}
        <Button type="submit" size="lg" block loading={save.isPending}>{t('common.save')}</Button>
      </form>
    </Page>
  );
}
