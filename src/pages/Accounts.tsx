import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Search } from 'lucide-react';
import { get, qs } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useCategories } from '../lib/data';
import { Button, Card, Chips, EmptyState, ErrorState, List, ListSkeleton, Money, Select } from '../components/ui';
import { Page } from '../components/Shell';
import { PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { TxRow, type TxItem } from '../components/rows';
import { useDebounced } from '../lib/useDebounced';

const KINDS = ['all', 'income', 'expense', 'donation', 'ritual_payment', 'event_expense', 'other_income'] as const;
type Kind = (typeof KINDS)[number];

export default function Accounts() {
  const { t, date } = useI18n();
  const categories = useCategories();
  const [kind, setKind] = useState<Kind>('all');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const { state, setState, range } = usePeriod('this_month');
  const q = useInfiniteQuery({
    queryKey: ['transactions', kind, category, term, range.from, range.to],
    queryFn: ({ pageParam }) => get(`/transactions${qs({ kind, category_id: category, search: term, from: range.from, to: range.to, page: pageParam, pageSize: 40 })}`),
    initialPageParam: 1,
    getNextPageParam: (last: any) => (last.page * last.pageSize < last.totals.count ? last.page + 1 : undefined),
  });
  const items: TxItem[] = q.data?.pages.flatMap((p: any) => p.items) ?? [];
  const totals = (q.data?.pages[0] as any)?.totals;
  // Group by date for a calmer list.
  const groups: [string, TxItem[]][] = [];
  for (const tx of items) {
    const last = groups[groups.length - 1];
    if (last && last[0] === tx.transaction_date) last[1].push(tx); else groups.push([tx.transaction_date, [tx]]);
  }
  return (
    <Page title={t('tx.title')} large>
      <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-line bg-paper px-4">
        <Search className="size-[18px] text-muted" aria-hidden />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('tx.searchPlaceholder')} aria-label={t('common.search')}
          className="w-full border-0 bg-transparent text-[15px] font-medium outline-none" />
      </label>
      <Chips label={t('tx.type')} value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: t(`tx.kind.${k}`) }))} />
      <PeriodPicker state={state} setState={setState} />
      <Select aria-label={t('common.category')} value={category} onChange={(e) => setCategory(e.target.value)} className="!h-11 !text-sm">
        <option value="">{t('tx.allCategories')}</option>
        {categories.data?.filter((c) => c.system_key !== 'opening_balance').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      {totals && (
        <Card className="grid grid-cols-3 py-3">
          <div className="flex flex-col items-center gap-0.5 border-r border-[#f1ebdf]"><span className="text-xs text-muted">{t('tx.income')}</span><Money paise={totals.income} tone="income" className="text-[15px] font-extrabold" /></div>
          <div className="flex flex-col items-center gap-0.5 border-r border-[#f1ebdf]"><span className="text-xs text-muted">{t('tx.expenses')}</span><Money paise={totals.expense} tone="expense" className="text-[15px] font-extrabold" /></div>
          <div className="flex flex-col items-center gap-0.5"><span className="text-xs text-muted">{t('tx.net')}</span><span className="tabular text-[15px] font-extrabold">{totals.income - totals.expense < 0 ? '−' : ''}<Money paise={Math.abs(totals.income - totals.expense)} /></span></div>
        </Card>
      )}
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <ListSkeleton rows={6} /> : items.length === 0 ? (
        <EmptyState icon={<ArrowLeftRight className="size-7" />} title={t('tx.empty')} hint={t('tx.emptyHint')} />
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map(([d, txs]) => (
            <section key={d} className="flex flex-col gap-1.5">
              <h3 className="px-1 pt-1 text-xs font-extrabold uppercase tracking-[0.08em] text-muted">{date(d)}</h3>
              <List>{txs.map((tx) => <TxRow key={tx.id} tx={tx} showDate={false} />)}</List>
            </section>
          ))}
        </div>
      )}
      {q.hasNextPage && <Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>{t('common.loadMore')}</Button>}
    </Page>
  );
}
