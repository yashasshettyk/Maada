import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { del, get, newId, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSave } from '../lib/forms';
import { useSettings } from '../lib/data';
import { todayIST } from '../../shared/dates';
import { formatINR } from '../../shared/money';
import { AmountInput, Button, Card, ConfirmDialog, DetailList, ErrorState, Field, IconButton, List, ListRow, Money, SectionTitle, SeveStatus, Sheet, Skeleton, TextInput, Toggle, useAmount } from '../components/ui';
import { ReceiptNumberField, ReceiptNumberSheet } from '../components/ReceiptNumber';
import { Page } from '../components/Shell';
import { MethodSelect, useMethodLabel } from '../components/MethodSelect';
import type { Entry } from './Seves';

function PaymentSheet({ entry, open, onClose }: { entry: Entry; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const settings = useSettings();
  const [paymentId, setPaymentId] = useState(newId);
  const amount = useAmount(entry.pending || null);
  const [date, setDate] = useState(todayIST());
  const [method, setMethod] = useState('Cash');
  const [receipt, setReceipt] = useState(true);
  const [receiptNo, setReceiptNo] = useState('');
  const over = !settings.data?.settings.allow_overpayment && (amount.paise ?? 0) > entry.pending;
  const save = useSave(() => post(`/ritual-entries/${entry.id}/payments`, { id: paymentId, amount: amount.paise, payment_date: date, payment_method: method, issue_receipt: receipt, receipt_number: receipt ? receiptNo.trim() : null }), {
    success: t('common.saved'),
    to: (r: any) => (r.receipt && receipt ? `/receipts/${r.receipt.id}` : null),
    replace: false,
    onDone: () => { onClose(); setPaymentId(newId()); setReceiptNo(''); },
  });
  return (
    <Sheet open={open} onClose={onClose} title={t('seve.recordPayment')}>
      <div className="flex flex-col gap-4">
        <Field label={t('common.amount')} htmlFor="p-amt" error={over ? t('seve.due', { amount: formatINR(entry.pending) }) : null}>
          <AmountInput id="p-amt" value={amount.text} onChange={amount.set} invalid={over} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('seve.paymentDate')} htmlFor="p-date"><TextInput id="p-date" type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={t('common.paymentMethod')} htmlFor="p-method"><MethodSelect id="p-method" value={method} onChange={setMethod} /></Field>
        </div>
        <Card className="!bg-sand !shadow-none"><Toggle checked={receipt} onChange={setReceipt} label={t('rcpt.generateAfterSave')} /></Card>
        {receipt && <ReceiptNumberField id="p-rno" value={receiptNo} onChange={setReceiptNo} />}
        <Button size="lg" block disabled={!amount.paise || over || (receipt && !receiptNo.trim())} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('seve.recordPayment')}</Button>
      </div>
    </Sheet>
  );
}

export default function SeveEntry() {
  const { id } = useParams();
  const { t, date, lang } = useI18n();
  const navigate = useNavigate();
  const method = useMethodLabel();
  const settings = useSettings();
  const q = useQuery({ queryKey: ['ritual-entry', id], queryFn: () => get(`/ritual-entries/${id}`) });
  const [payOpen, setPayOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deletePayment, setDeletePayment] = useState<string | null>(null);
  const remove = useSave(() => del(`/ritual-entries/${id}`), { success: t('common.deleted'), to: () => '/seves' });
  const removePayment = useSave(() => del(`/ritual-payments/${deletePayment}`), { success: t('common.deleted'), onDone: () => setDeletePayment(null) });
  const [issueFor, setIssueFor] = useState<string | null>(null);
  const issue = useSave((v: { paymentId: string; number: string }) => post('/receipts', { receipt_type: 'ritual_payment', source_id: v.paymentId, receipt_number: v.number }), { to: (r: any) => `/receipts/${r.item.id}`, replace: false, onDone: () => setIssueFor(null) });
  const e: Entry | undefined = q.data?.item;
  const pct = e && e.prescribed_amount > 0 ? Math.min(100, Math.round((e.paid / e.prescribed_amount) * 100)) : 100;

  return (
    <Page title={t('seve.entry')} back actions={e && (
      <>
        <IconButton label={t('common.edit')} onClick={() => navigate(`/seves/${id}/edit`)}><Pencil className="size-5" /></IconButton>
        <IconButton label={t('common.delete')} onClick={() => setConfirm(true)}><Trash2 className="size-5 text-expense" /></IconButton>
      </>
    )}>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !e ? <Skeleton className="h-80 w-full" /> : (
        <>
          <section className="flex flex-col gap-1 px-1">
            <h2 className="text-[26px] font-extrabold leading-tight tracking-tight">{e.devotee_name}</h2>
            <p className="text-[15px] text-ink-soft">{lang === 'kn' && e.receipt_title ? e.receipt_title : e.ritual_name} · {date(e.ritual_date)}</p>
          </section>
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between"><SeveStatus status={e.status} /><span className="text-[13px] text-muted">{t('seve.receivedPct', { pct })}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-[#f1ebdf]"><div className="h-full rounded-full bg-[#27835B]" style={{ width: `${pct}%` }} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1"><span className="text-xs text-muted">{t('seve.prescribed')}</span><Money paise={e.prescribed_amount} className="text-base font-extrabold" /></div>
              <div className="flex flex-col gap-1"><span className="text-xs text-muted">{t('seve.received')}</span><Money paise={e.paid} tone="income" className="text-base font-extrabold" /></div>
              <div className="flex flex-col gap-1"><span className="text-xs text-muted">{t('seve.pending')}</span><Money paise={e.pending} tone="pending" className="text-base font-extrabold" /></div>
            </div>
            {(e.pending > 0 || settings.data?.settings.allow_overpayment) && (
              <Button size="lg" icon={<Plus className="size-5" strokeWidth={2.4} />} onClick={() => setPayOpen(true)}>{t('seve.recordPayment')}</Button>
            )}
          </Card>

          <section className="flex flex-col gap-1.5">
            <SectionTitle>{t('seve.payments')}</SectionTitle>
            {q.data.payments.length === 0 ? <p className="px-1 text-sm text-muted">{t('seve.noPayments')}</p> : (
              <List>
                {q.data.payments.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <Money paise={p.amount} sign tone="income" className="text-[15px] font-extrabold" />
                      <span className="text-xs text-muted">{date(p.payment_date)}{p.payment_method ? ` · ${method(p.payment_method)}` : ''}</span>
                    </div>
                    {p.receipt_id ? (
                      <Link to={`/receipts/${p.receipt_id}`} className="flex h-9 items-center gap-1.5 rounded-xl bg-sand px-3 text-xs font-bold text-maroon"><ReceiptText className="size-4" />{p.receipt_number}</Link>
                    ) : (
                      <Button size="sm" variant="gold" onClick={() => setIssueFor(p.id)}>{t('rcpt.create')}</Button>
                    )}
                    <IconButton label={t('common.delete')} onClick={() => setDeletePayment(p.id)}><Trash2 className="size-[18px] text-muted" /></IconButton>
                  </div>
                ))}
              </List>
            )}
          </section>

          {q.data.expenses.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <SectionTitle>{t('seve.expenses')}</SectionTitle>
              <List>
                {q.data.expenses.map((x: any) => (
                  <ListRow key={x.id} to={`/expenses/${x.id}/edit`} title={x.title} subtitle={`${x.category_name} · ${date(x.expense_date)}`}
                    trailing={<Money paise={x.amount} sign tone="expense" className="text-[15px] font-extrabold" />} />
                ))}
              </List>
            </section>
          )}
          <DetailList rows={[
            { label: t('seve.contact'), value: e.contact },
            { label: t('common.event'), value: e.event_name },
            { label: t('common.notes'), value: e.notes },
          ]} />
          <PaymentSheet entry={e} open={payOpen} onClose={() => setPayOpen(false)} />
        </>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t('seve.deleteEntry')} message={t('seve.deleteEntryHint')}
        confirmLabel={t('common.delete')} loading={remove.isPending} onConfirm={() => remove.mutate(undefined)} />
      <ConfirmDialog open={!!deletePayment} onClose={() => setDeletePayment(null)} title={t('seve.deletePayment')} message={t('seve.deletePaymentHint')}
        confirmLabel={t('common.delete')} loading={removePayment.isPending} onConfirm={() => removePayment.mutate(undefined)} />
      <ReceiptNumberSheet open={issueFor != null} onClose={() => setIssueFor(null)} loading={issue.isPending} onSubmit={(number) => issueFor && issue.mutate({ paymentId: issueFor, number })} />
    </Page>
  );
}
