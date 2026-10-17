import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Pencil, ReceiptText, Trash2 } from 'lucide-react';
import { del, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSave } from '../lib/forms';
import { amountInWords } from '../../shared/words';
import { amountInKannadaWords } from '../../shared/words-kn';
import { formatTimestamp } from '../../shared/dates';
import { Badge, Button, ConfirmDialog, DetailList, ErrorState, IconButton, IconTile, List, ListRow, Money, SectionTitle, Skeleton } from '../components/ui';
import { ReceiptNumberSheet } from '../components/ReceiptNumber';
import { Page } from '../components/Shell';
import { useMethodLabel } from '../components/MethodSelect';

export default function DonationDetail() {
  const { id } = useParams();
  const { t, lang, date } = useI18n();
  const navigate = useNavigate();
  const method = useMethodLabel();
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: ['donation', id], queryFn: () => get(`/donations/${id}`) });
  const remove = useSave(() => del(`/donations/${id}`), { success: t('common.deleted'), to: () => '/donations' });
  const [issueOpen, setIssueOpen] = useState(false);
  const issue = useSave((number: string) => post('/receipts', { receipt_type: 'donation', source_id: id, receipt_number: number }), { to: (r: any) => `/receipts/${r.item.id}`, replace: false, onDone: () => setIssueOpen(false) });
  const d = q.data?.item;
  const receipts: any[] = q.data?.receipts ?? [];
  const active = receipts.find((r) => r.status === 'issued');

  return (
    <Page title={t('src.donation')} back actions={d && (
      <>
        <IconButton label={t('common.edit')} onClick={() => navigate(`/donations/${id}/edit`)}><Pencil className="size-5" /></IconButton>
        <IconButton label={t('common.delete')} onClick={() => setConfirm(true)}><Trash2 className="size-5 text-expense" /></IconButton>
      </>
    )}>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !d ? <Skeleton className="h-72 w-full" /> : (
        <>
          <section className="flex flex-col items-center gap-1 pt-3 text-center">
            <Money paise={d.amount} className="text-[38px] font-extrabold tracking-tight text-maroon" />
            <p className="max-w-sm text-sm text-muted">{lang === 'kn' ? amountInKannadaWords(d.amount) : amountInWords(d.amount)}</p>
            <p className="mt-2 text-lg font-bold">{d.donor_name}</p>
          </section>
          {active ? (
            <Button size="lg" block icon={<ReceiptText className="size-5" />} onClick={() => navigate(`/receipts/${active.id}`)}>{t('rcpt.view')}</Button>
          ) : (
            <Button size="lg" block variant="gold" icon={<ReceiptText className="size-5" />} onClick={() => setIssueOpen(true)}>{t('rcpt.create')}</Button>
          )}
          <DetailList rows={[
            { label: t('common.date'), value: date(d.donation_date) },
            { label: t('don.purpose'), value: d.purpose },
            { label: t('common.paymentMethod'), value: method(d.payment_method) },
            { label: t('common.reference'), value: d.reference_number },
            { label: t('common.event'), value: d.event_name },
            { label: t('common.notes'), value: d.notes },
            { label: t('common.created'), value: formatTimestamp(d.created_at) },
          ]} />
          {receipts.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <SectionTitle>{t('rcpt.title')}</SectionTitle>
              <List>
                {receipts.map((r) => (
                  <ListRow key={r.id} to={`/receipts/${r.id}`} chevron
                    icon={<IconTile tone={r.status === 'issued' ? 'gold' : 'neutral'}><ReceiptText className="size-[18px]" /></IconTile>}
                    title={r.receipt_number} subtitle={r.status === 'cancelled' ? r.cancel_reason : formatTimestamp(r.created_at)}
                    trailing={<Badge tone={r.status === 'issued' ? 'income' : 'expense'}>{r.status === 'issued' ? t('rcpt.issued') : t('rcpt.cancelled')}</Badge>} />
                ))}
              </List>
            </section>
          )}
        </>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t('don.delete')} message={t('don.deleteHint')}
        confirmLabel={t('common.delete')} loading={remove.isPending} onConfirm={() => remove.mutate(undefined)} />
      <ReceiptNumberSheet open={issueOpen} onClose={() => setIssueOpen(false)} loading={issue.isPending} onSubmit={(number) => issue.mutate(number)} />
    </Page>
  );
}
