import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ReceiptText } from 'lucide-react';
import { get } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatTimestamp } from '../../shared/dates';
import { Badge, Button, DetailList, ErrorState, Money, Skeleton } from '../components/ui';
import { Page } from '../components/Shell';
import type { StringKey } from '../lib/strings';

export default function AccountEntry() {
  const { id } = useParams();
  const { t, date } = useI18n();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['transaction', id], queryFn: () => get(`/transactions/${id}`) });
  const tx = q.data?.item;

  // Find where the underlying record is edited.
  const recordLink = async () => {
    if (!tx) return;
    switch (tx.source_type) {
      case 'donation': return navigate(`/donations/${tx.source_id}`);
      case 'ritual_payment': return navigate(`/seves/${tx.ritual_entry_id}`);
      case 'expense': return navigate(`/expenses/${tx.source_id}/edit`);
      case 'other_income': return navigate(`/income/${tx.source_id}/edit`);
      case 'opening_balance': return navigate('/settings#opening');
    }
  };

  return (
    <Page title={t('tx.detail')} back>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !tx ? <Skeleton className="h-72 w-full" /> : (
        <>
          <section className="flex flex-col items-center gap-2 pt-3 text-center">
            <Badge tone={tx.transaction_type === 'income' ? 'income' : 'expense'}>{tx.transaction_type === 'income' ? t('tx.incomeLabel') : t('tx.expenseLabel')}</Badge>
            <Money paise={tx.amount} sign tone={tx.transaction_type === 'income' ? 'income' : 'expense'} className="text-[38px] font-extrabold tracking-tight" />
            <p className="max-w-sm text-lg font-bold">{tx.description}</p>
          </section>
          <DetailList rows={[
            { label: t('tx.type'), value: t(`src.${tx.source_type}` as StringKey) },
            { label: t('common.date'), value: date(tx.transaction_date) },
            { label: t('common.category'), value: tx.category_name },
            { label: t('common.event'), value: tx.event_name },
            { label: t('seve.seve'), value: tx.ritual_name },
            { label: t('tx.party'), value: tx.party_name },
            { label: t('common.notes'), value: tx.notes },
            { label: t('common.created'), value: formatTimestamp(tx.created_at) },
          ]} />
          <div className="flex flex-col gap-2.5">
            {tx.receipt_id && <Button icon={<ReceiptText className="size-5" />} onClick={() => navigate(`/receipts/${tx.receipt_id}`)}>{t('rcpt.view')} · {tx.receipt_number}</Button>}
            <Button variant="secondary" icon={<ExternalLink className="size-5" />} onClick={recordLink}>{t('tx.openRecord')}</Button>
          </div>
          {q.data.history?.length > 1 && (
            <DetailList rows={q.data.history.map((h: any) => ({ label: t(`audit.${h.action}` as StringKey), value: formatTimestamp(h.created_at) }))} />
          )}
        </>
      )}
    </Page>
  );
}
