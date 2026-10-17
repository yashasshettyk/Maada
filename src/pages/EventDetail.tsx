import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { del, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSave } from '../lib/forms';
import type { StringKey } from '../lib/strings';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, List, ListRow, Money, SectionTitle, Skeleton } from '../components/ui';
import { ReceiptNumberSheet } from '../components/ReceiptNumber';
import { Page } from '../components/Shell';

export default function EventDetail() {
  const { id } = useParams();
  const { t, date } = useI18n();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: ['event', id], queryFn: () => get(`/events/${id}`) });
  const remove = useSave(() => del(`/events/${id}`), { success: t('common.deleted'), to: () => '/events' });
  const [billOpen, setBillOpen] = useState(false);
  const bill = useSave((v: { refresh: boolean; number?: string }) => post(`/events/${id}/bill${v.refresh ? '?refresh=1' : ''}`, { receipt_number: v.number ?? null }), { to: (r: any) => `/receipts/${r.receipt.id}`, replace: false, onDone: () => setBillOpen(false) });
  const ev = q.data?.item;
  const totals = q.data?.totals;
  return (
    <Page title={ev?.name ?? t('common.event')} back actions={ev && (
      <>
        <IconButton label={t('common.edit')} onClick={() => navigate(`/events/${id}/edit`)}><Pencil className="size-5" /></IconButton>
        <IconButton label={t('common.delete')} onClick={() => setConfirm(true)}><Trash2 className="size-5 text-expense" /></IconButton>
      </>
    )}>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !ev ? <Skeleton className="h-80 w-full" /> : (
        <>
          <p className="-mt-2 px-1 text-sm text-muted">{date(ev.event_date)}{ev.description ? ` · ${ev.description}` : ''}</p>
          <Card className="grid grid-cols-3 gap-2 p-4">
            <div className="flex flex-col gap-1"><span className="text-xs text-muted">{t('ev.incomeTotal')}</span><Money paise={totals.income} tone="income" className="text-base font-extrabold" /></div>
            <div className="flex flex-col gap-1"><span className="text-xs text-muted">{t('ev.expenseTotal')}</span><Money paise={totals.expense} tone="expense" className="text-base font-extrabold" /></div>
            <div className="flex flex-col gap-1"><span className="text-xs text-muted">{t('ev.net')}</span><span className="tabular text-base font-extrabold">{totals.net < 0 ? '−' : ''}<Money paise={Math.abs(totals.net)} /></span></div>
          </Card>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Button icon={<Plus className="size-5" strokeWidth={2.4} />} onClick={() => navigate(`/expenses/new?event=${id}`)}>{t('ev.addExpense')}</Button>
            {q.data.bill ? (
              <Button variant="gold" icon={<FileText className="size-5" />} onClick={() => navigate(`/receipts/${q.data.bill.id}`)}>{t('ev.billView')}</Button>
            ) : (
              <Button variant="gold" icon={<FileText className="size-5" />} disabled={!q.data.expenses.length} onClick={() => setBillOpen(true)}>{t('ev.billCreate')}</Button>
            )}
          </div>
          {q.data.bill && (
            <Button variant="ghost" size="sm" icon={<RefreshCw className="size-4" />} loading={bill.isPending} onClick={() => bill.mutate({ refresh: true })}>{t('ev.billRefresh')}</Button>
          )}

          <section className="flex flex-col gap-1.5">
            <SectionTitle>{t('ev.expenses')}</SectionTitle>
            {q.data.expenses.length === 0 ? <EmptyState title={t('ev.noExpenses')} /> : (
              <List>
                {q.data.expenses.map((x: any) => (
                  <ListRow key={x.id} to={`/expenses/${x.id}/edit`} title={x.title}
                    subtitle={[x.quantity, x.vendor, x.category_name].filter(Boolean).join(' · ')}
                    trailing={<Money paise={x.amount} sign tone="expense" className="text-[15px] font-extrabold" />} />
                ))}
              </List>
            )}
          </section>
          {q.data.breakdown.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <SectionTitle>{t('ev.breakdown')}</SectionTitle>
              <Card className="flex flex-col gap-3 p-4">
                {q.data.breakdown.map((b: any) => (
                  <div key={b.category} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-sm"><span className="font-semibold">{b.category}</span><Money paise={b.total} className="font-bold" /></div>
                    <div className="h-1.5 rounded-full bg-[#f1ebdf]"><div className="h-full rounded-full bg-[#C34A4A]" style={{ width: `${Math.round((b.total / totals.expense) * 100)}%` }} /></div>
                  </div>
                ))}
              </Card>
            </section>
          )}
          {q.data.income.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <SectionTitle>{t('ev.income')}</SectionTitle>
              <List>
                {q.data.income.map((i: any) => (
                  <ListRow key={i.id} to={`/accounts/${i.id}`} title={i.description} subtitle={`${t(`src.${i.source_type}` as StringKey)} · ${date(i.transaction_date)}`}
                    trailing={<Money paise={i.amount} sign tone="income" className="text-[15px] font-extrabold" />} />
                ))}
              </List>
            </section>
          )}
        </>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t('ev.delete')} message={t('ev.deleteHint')}
        confirmLabel={t('common.delete')} loading={remove.isPending} onConfirm={() => remove.mutate(undefined)} />
      <ReceiptNumberSheet open={billOpen} onClose={() => setBillOpen(false)} title={t('ev.billCreate')} loading={bill.isPending} onSubmit={(number) => bill.mutate({ refresh: false, number })} />
    </Page>
  );
}
