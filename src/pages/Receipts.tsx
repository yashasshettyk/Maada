import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, Flame, HandHeart, Search } from 'lucide-react';
import { get, qs } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Badge, Button, Chips, EmptyState, ErrorState, IconTile, List, ListRow, ListSkeleton, Money } from '../components/ui';
import { Page } from '../components/Shell';
import { useDebounced } from '../lib/useDebounced';

type Kind = 'all' | 'donation' | 'ritual_payment' | 'expense_bill';

export default function Receipts() {
  const { t, date } = useI18n();
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>('all');
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const q = useInfiniteQuery({
    queryKey: ['receipts', kind, term],
    queryFn: ({ pageParam }) => get(`/receipts${qs({ type: kind === 'all' ? null : kind, search: term, page: pageParam, pageSize: 30 })}`),
    initialPageParam: 1,
    getNextPageParam: (last: any) => (last.page * last.pageSize < last.count ? last.page + 1 : undefined),
  });
  const items: any[] = q.data?.pages.flatMap((p: any) => p.items) ?? [];
  const icon = (type: string) => type === 'donation' ? <HandHeart className="size-[18px]" /> : type === 'ritual_payment' ? <Flame className="size-[18px]" /> : <FileText className="size-[18px]" />;
  return (
    <Page title={t('rcpt.title')} large>
      <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-line bg-paper px-4">
        <Search className="size-[18px] text-muted" aria-hidden />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('rcpt.searchPlaceholder')} aria-label={t('common.search')}
          className="w-full border-0 bg-transparent text-[15px] font-medium outline-none" />
      </label>
      <Chips label={t('common.filters')} value={kind} onChange={setKind} options={[
        { value: 'all', label: t('common.all') },
        { value: 'donation', label: t('rcpt.type.donation') },
        { value: 'ritual_payment', label: t('rcpt.type.ritual_payment') },
        { value: 'expense_bill', label: t('rcpt.type.expense_bill') },
      ]} />
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" icon={<HandHeart className="size-5" />} onClick={() => navigate('/donations/new')}>{t('qa.donation')}</Button>
        <Button variant="secondary" icon={<Flame className="size-5" />} onClick={() => navigate('/seves/receipt')}>{t('qa.seve')}</Button>
      </div>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <ListSkeleton /> : items.length === 0 ? (
        <EmptyState icon={<FileText className="size-7" />} title={t('rcpt.empty')} hint={t('rcpt.emptyHint')} />
      ) : (
        <List>
          {items.map((r) => (
            <ListRow key={r.id} to={`/receipts/${r.id}`}
              icon={<IconTile tone={r.status === 'issued' ? (r.receipt_type === 'expense_bill' ? 'neutral' : 'gold') : 'neutral'}>{icon(r.receipt_type)}</IconTile>}
              title={r.name ?? r.event_name ?? r.receipt_number}
              subtitle={`${r.receipt_number} · ${date(r.date ?? r.issue_date)}`}
              trailing={
                <span className="flex flex-col items-end gap-1">
                  {r.amount != null && <Money paise={r.amount} className="text-[15px] font-extrabold" />}
                  {r.status === 'cancelled' && <Badge tone="expense">{t('rcpt.cancelled')}</Badge>}
                </span>
              } />
          ))}
        </List>
      )}
      {q.hasNextPage && <Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>{t('common.loadMore')}</Button>}
    </Page>
  );
}
