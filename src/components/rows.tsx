import { ArrowDownLeft, ArrowUpRight, ReceiptText } from 'lucide-react';
import { IconTile, ListRow, Money } from './ui';
import { useI18n } from '../lib/i18n';
import type { StringKey } from '../lib/strings';

export interface TxItem {
  id: string; transaction_type: 'income' | 'expense'; source_type: string; source_id: string; amount: number;
  transaction_date: string; description: string; category_name: string | null; event_name: string | null;
  ritual_name: string | null; party_name: string | null; receipt_id: string | null; receipt_number: string | null;
}

export function TxRow({ tx, showDate = true }: { tx: TxItem; showDate?: boolean }) {
  const { t, date } = useI18n();
  const income = tx.transaction_type === 'income';
  const sub = [t(`src.${tx.source_type}` as StringKey), tx.event_name, showDate ? date(tx.transaction_date) : null].filter(Boolean).join(' · ');
  return (
    <ListRow
      to={`/accounts/${tx.id}`}
      icon={<IconTile tone={income ? 'income' : 'expense'}>{income ? <ArrowDownLeft className="size-[18px]" strokeWidth={2.3} /> : <ArrowUpRight className="size-[18px]" strokeWidth={2.3} />}</IconTile>}
      title={tx.description}
      subtitle={<span className="inline-flex items-center gap-1.5">{sub}{tx.receipt_id && <ReceiptText className="size-3.5 text-gold-ink" aria-label={t('don.receiptIssued')} />}</span>}
      trailing={<Money paise={tx.amount} sign tone={income ? 'income' : 'expense'} className="text-[15px] font-extrabold" />}
    />
  );
}
