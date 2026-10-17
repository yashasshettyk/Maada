import { useEffect, useState } from 'react';
import { newId, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSave } from '../lib/forms';
import { useEvents, useRituals } from '../lib/data';
import { todayIST } from '../../shared/dates';
import { amountInKannadaWords } from '../../shared/words-kn';
import { amountInWords } from '../../shared/words';
import { AmountInput, Button, Field, Select, TextArea, TextInput, useAmount } from '../components/ui';
import { ReceiptNumberField } from '../components/ReceiptNumber';
import { Page } from '../components/Shell';
import { MethodSelect } from '../components/MethodSelect';
import { RitualSelect } from '../components/RitualSelect';

/** One step: record a fully paid seve and go straight to its receipt. */
export default function SeveQuick() {
  const { t, lang } = useI18n();
  const rituals = useRituals();
  const events = useEvents();
  const [ids] = useState(() => ({ entry: newId(), payment: newId() }));
  const [ritualId, setRitualId] = useState('');
  const [devotee, setDevotee] = useState('');
  const [seveDate, setSeveDate] = useState(todayIST());
  const [paidOn, setPaidOn] = useState(todayIST());
  const [method, setMethod] = useState('Cash');
  const [eventId, setEventId] = useState('');
  const [notes, setNotes] = useState('');
  const amount = useAmount();
  const [touched, setTouched] = useState(false);
  const [receiptNo, setReceiptNo] = useState('');

  useEffect(() => {
    if (!ritualId && rituals.data?.length) {
      const first = rituals.data.find((r) => r.name === 'Sankranti Seve') ?? rituals.data[0];
      setRitualId(first.id);
      if (first.default_amount && !amount.paise) amount.reset(first.default_amount);
    }
  }, [rituals.data, ritualId, amount]);

  const valid = ritualId && devotee.trim() && amount.paise && seveDate && paidOn && receiptNo.trim();
  const save = useSave(
    () => post('/ritual-entries', {
      id: ids.entry, ritual_id: ritualId, devotee_name: devotee, ritual_date: seveDate, prescribed_amount: amount.paise,
      notes, event_id: eventId || null,
      initial_payment: { id: ids.payment, amount: amount.paise, payment_date: paidOn, payment_method: method },
      issue_receipt: true,
      receipt_number: receiptNo.trim(),
    }),
    { success: t('common.saved'), to: (r: any) => (r.receipt ? `/receipts/${r.receipt.id}` : `/seves/${ids.entry}`) },
  );

  return (
    <Page title={t('seve.quickTitle')} back>
      <p className="-mt-1 px-1 text-sm leading-relaxed text-muted">{t('seve.quickHint')}</p>
      <form noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (valid) save.mutate(undefined); }} className="flex flex-col gap-5">
        <div className="flex flex-col items-center gap-1.5 pt-1">
          <label htmlFor="q-amount" className="text-[13px] font-bold text-ink-soft">{t('seve.prescribed')}</label>
          <AmountInput id="q-amount" large value={amount.text} onChange={amount.set} invalid={touched && !amount.paise} />
          <p className="min-h-5 text-center text-[13px] text-muted">{amount.paise ? (lang === 'kn' ? amountInKannadaWords(amount.paise) : amountInWords(amount.paise)) : ''}</p>
        </div>
        <Field label={t('seve.seve')} htmlFor="q-ritual">
          <RitualSelect id="q-ritual" rituals={rituals.data ?? []} value={ritualId} onChange={(r) => { setRitualId(r?.id ?? ''); if (r?.default_amount) amount.reset(r.default_amount); }} />
        </Field>
        <Field label={t('seve.devotee')} htmlFor="q-name" hint={t('common.typeKnOrEn')} error={touched && !devotee.trim() ? `${t('seve.devotee')}?` : null}>
          <TextInput id="q-name" value={devotee} onChange={(e) => setDevotee(e.target.value)} placeholder={t('seve.devoteePlaceholder')} invalid={touched && !devotee.trim()} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('seve.date')} htmlFor="q-date"><TextInput id="q-date" type="date" value={seveDate} onChange={(e) => setSeveDate(e.target.value)} /></Field>
          <Field label={t('seve.paymentDate')} htmlFor="q-paid"><TextInput id="q-paid" type="date" value={paidOn} max={todayIST()} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        </div>
        <Field label={t('common.paymentMethod')} htmlFor="q-method"><MethodSelect id="q-method" value={method} onChange={setMethod} /></Field>
        {(events.data?.length ?? 0) > 0 && (
          <Field label={t('seve.linkEvent')} htmlFor="q-event" optional>
            <Select id="q-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">{t('common.none')}</option>
              {events.data!.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </Select>
          </Field>
        )}
        <ReceiptNumberField id="q-rno" value={receiptNo} onChange={setReceiptNo} touched={touched} />
        <Field label={t('common.notes')} htmlFor="q-notes" optional><TextArea id="q-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('common.notesPlaceholder')} /></Field>
        <Button type="submit" size="lg" block loading={save.isPending}>{t('rcpt.create')}</Button>
      </form>
    </Page>
  );
}
