import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Flame, Plus, ReceiptText, Search } from 'lucide-react';
import { get, qs } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatINR } from '../../shared/money';
import { Button, Card, Chips, EmptyState, ErrorState, ListSkeleton, Money, Select, SeveStatus } from '../components/ui';
import { FloatingAction, Page } from '../components/Shell';
import { useDebounced } from '../lib/useDebounced';
import { useRituals } from '../lib/data';

type Status = 'all' | 'pending' | 'partial' | 'paid';
type Sort = 'date' | 'date_asc' | 'pending' | 'name';

export interface Entry {
  id: string; ritual_id: string; ritual_name: string; receipt_title: string | null; devotee_name: string; ritual_date: string;
  prescribed_amount: number; paid: number; pending: number; status: 'pending' | 'partial' | 'paid' | 'overpaid'; contact: string | null;
  notes: string | null; event_id: string | null; event_name: string | null;
}

export function EntryCard({ e }: { e: Entry }) {
  const { t, date, lang } = useI18n();
  const pct = e.prescribed_amount > 0 ? Math.min(100, Math.round((e.paid / e.prescribed_amount) * 100)) : 100;
  const title = lang === 'kn' && e.receipt_title ? e.receipt_title : e.ritual_name;
  return (
    <Link to={`/seves/${e.id}`} className="block">
      <Card className="flex flex-col gap-3 p-4 transition-colors hover:bg-[#fbf6ec]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-base font-extrabold">{e.devotee_name}</span>
            <span className="truncate text-[13px] text-muted">{title} · {date(e.ritual_date)}</span>
          </div>
          <SeveStatus status={e.status} />
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#f1ebdf]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[#27835B]" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <span className="text-ink-soft">{t('seve.paidOf', { paid: formatINR(e.paid), total: formatINR(e.prescribed_amount) })}</span>
          {e.pending > 0 ? <span className="font-extrabold text-pending">{t('seve.due', { amount: formatINR(e.pending) })}</span> : <span className="font-bold text-income">{t('seve.settled')}</span>}
        </div>
      </Card>
    </Link>
  );
}

export default function Seves() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const rituals = useRituals();
  const [status, setStatus] = useState<Status>('all');
  const [sort, setSort] = useState<Sort>('date');
  const [ritualId, setRitualId] = useState('');
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const q = useInfiniteQuery({
    queryKey: ['ritual-entries', status, sort, ritualId, term],
    queryFn: ({ pageParam }) => get(`/ritual-entries${qs({ status: status === 'all' ? null : status, sort, ritual_id: ritualId, search: term, page: pageParam, pageSize: 30 })}`),
    initialPageParam: 1,
    getNextPageParam: (last: any) => (last.page * last.pageSize < last.summary.count ? last.page + 1 : undefined),
  });
  const items: Entry[] = q.data?.pages.flatMap((p: any) => p.items) ?? [];
  const summary = (q.data?.pages[0] as any)?.summary;

  return (
    <Page title={t('seve.title')} large actions={<Button size="sm" variant="secondary" onClick={() => navigate('/settings#seves')}>{t('seve.types')}</Button>}>
      <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-line bg-paper px-4">
        <Search className="size-[18px] text-muted" aria-hidden />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('seve.searchPlaceholder')} aria-label={t('common.search')}
          className="w-full border-0 bg-transparent text-[15px] font-medium outline-none" />
      </label>
      <Chips label={t('common.status')} value={status} onChange={setStatus} options={[
        { value: 'all', label: t('common.all') }, { value: 'pending', label: t('seve.status.pending') },
        { value: 'partial', label: t('seve.status.partial') }, { value: 'paid', label: t('seve.status.paid') },
      ]} />
      <div className="grid grid-cols-2 gap-2.5">
        <Select aria-label={t('seve.seve')} value={ritualId} onChange={(e) => setRitualId(e.target.value)} className="!h-11 !text-sm">
          <option value="">{t('seve.allTypes')}</option>
          {rituals.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Select aria-label={t('common.sort')} value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="!h-11 !text-sm">
          {(['date', 'date_asc', 'pending', 'name'] as const).map((s) => <option key={s} value={s}>{t(`seve.sort.${s}`)}</option>)}
        </Select>
      </div>
      {summary && summary.pending > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-pending-bg px-4 py-3">
          <span className="text-[13px] font-semibold text-[#6a4610]">{t('seve.outstanding', { n: summary.pending_count })}</span>
          <Money paise={summary.pending} className="text-base font-extrabold text-[#6a4610]" />
        </div>
      )}
      <Button variant="gold" icon={<ReceiptText className="size-5" />} onClick={() => navigate('/seves/receipt')}>{t('seve.quickTitle')}</Button>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <ListSkeleton /> : items.length === 0 ? (
        <EmptyState icon={<Flame className="size-7" />} title={t('seve.empty')} hint={t('seve.emptyHint')} />
      ) : (
        <div className="flex flex-col gap-2.5">{items.map((e) => <EntryCard key={e.id} e={e} />)}</div>
      )}
      {q.hasNextPage && <Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>{t('common.loadMore')}</Button>}
      <div className="h-16" />
      <FloatingAction withNav to="/seves/new" label={t('seve.new')} icon={<Plus className="size-5" strokeWidth={2.4} />} />
    </Page>
  );
}
