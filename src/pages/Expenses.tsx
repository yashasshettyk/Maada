import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Plus, Receipt, Search } from 'lucide-react';
import { get, qs } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useCategories } from '../lib/data';
import { formatINR } from '../../shared/money';
import { Button, EmptyState, ErrorState, List, ListRow, ListSkeleton, Money, Select } from '../components/ui';
import { FloatingAction, Page } from '../components/Shell';
import { PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { useDebounced } from '../lib/useDebounced';

export default function Expenses() {
  const { t, date } = useI18n();
  const categories = useCategories();
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const { state, setState, range } = usePeriod('this_month');
  const q = useInfiniteQuery({
    queryKey: ['expenses', category, term, range.from, range.to],
    queryFn: ({ pageParam }) => get(`/expenses${qs({ category_id: category, search: term, from: range.from, to: range.to, page: pageParam, pageSize: 40 })}`),
    initialPageParam: 1,
    getNextPageParam: (last: any) => (last.page * last.pageSize < last.summary.count ? last.page + 1 : undefined),
  });
  const items: any[] = q.data?.pages.flatMap((p: any) => p.items) ?? [];
  const summary = (q.data?.pages[0] as any)?.summary;
  return (
    <Page title={t('exp.title')} back="/more">
      <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-line bg-paper px-4">
        <Search className="size-[18px] text-muted" aria-hidden />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('exp.searchPlaceholder')} aria-label={t('common.search')}
          className="w-full border-0 bg-transparent text-[15px] font-medium outline-none" />
      </label>
      <PeriodPicker state={state} setState={setState} />
      <Select aria-label={t('common.category')} value={category} onChange={(e) => setCategory(e.target.value)} className="!h-11 !text-sm">
        <option value="">{t('tx.allCategories')}</option>
        {categories.data?.filter((c) => c.category_type === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      {summary && summary.count > 0 && <p className="px-1 text-sm font-semibold text-ink-soft">{t('common.items', { n: summary.count })} · {formatINR(summary.total)}</p>}
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <ListSkeleton /> : items.length === 0 ? (
        <EmptyState icon={<Receipt className="size-7" />} title={t('exp.empty')} />
      ) : (
        <List>
          {items.map((x) => (
            <ListRow key={x.id} to={`/expenses/${x.id}/edit`} title={x.title}
              subtitle={[x.category_name, x.event_name, date(x.expense_date)].filter(Boolean).join(' · ')}
              trailing={<Money paise={x.amount} sign tone="expense" className="text-[15px] font-extrabold" />} />
          ))}
        </List>
      )}
      {q.hasNextPage && <Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>{t('common.loadMore')}</Button>}
      <div className="h-16" />
      <FloatingAction to="/expenses/new" label={t('exp.new')} icon={<Plus className="size-5" strokeWidth={2.4} />} />
    </Page>
  );
}
