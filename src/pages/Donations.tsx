import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { HandHeart, Plus, ReceiptText, Search } from 'lucide-react';
import { get, qs } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatINR } from '../../shared/money';
import { Button, EmptyState, ErrorState, IconTile, List, ListRow, ListSkeleton, Money } from '../components/ui';
import { FloatingAction, Page } from '../components/Shell';
import { PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { useDebounced } from '../lib/useDebounced';

export default function Donations() {
  const { t, date } = useI18n();
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const { state, setState, range } = usePeriod('all');
  const q = useInfiniteQuery({
    queryKey: ['donations', term, range.from, range.to],
    queryFn: ({ pageParam }) => get(`/donations${qs({ search: term, from: range.from, to: range.to, page: pageParam, pageSize: 30 })}`),
    initialPageParam: 1,
    getNextPageParam: (last: any) => (last.page * last.pageSize < last.count ? last.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p: any) => p.items) ?? [];
  const first: any = q.data?.pages[0];
  return (
    <Page title={t('don.title')} back="/more">
      <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-line bg-paper px-4">
        <Search className="size-[18px] text-muted" aria-hidden />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('don.searchPlaceholder')} aria-label={t('common.search')}
          className="w-full border-0 bg-transparent text-[15px] font-medium outline-none" />
      </label>
      <PeriodPicker state={state} setState={setState} />
      {first && first.count > 0 && <p className="px-1 text-sm font-semibold text-ink-soft">{t('don.total', { n: first.count, amount: formatINR(first.total) })}</p>}
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <ListSkeleton /> : items.length === 0 ? (
        <EmptyState icon={<HandHeart className="size-7" />} title={t('don.empty')} hint={t('don.emptyHint')} />
      ) : (
        <List>
          {items.map((d: any) => (
            <ListRow key={d.id} to={`/donations/${d.id}`}
              icon={<IconTile tone="maroon"><HandHeart className="size-[18px]" /></IconTile>}
              title={d.donor_name}
              subtitle={<span className="inline-flex items-center gap-1.5">{date(d.donation_date)} · {d.purpose}{d.receipt_id && <ReceiptText className="size-3.5 text-gold-ink" aria-label={t('don.receiptIssued')} />}</span>}
              trailing={<Money paise={d.amount} tone="income" className="text-[15px] font-extrabold" />} />
          ))}
        </List>
      )}
      {q.hasNextPage && <Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>{t('common.loadMore')}</Button>}
      <div className="h-16" />
      <FloatingAction to="/donations/new" label={t('don.new')} icon={<Plus className="size-5" strokeWidth={2.4} />} />
    </Page>
  );
}
