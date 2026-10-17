import { Link } from 'react-router-dom';
import { CalendarDays, Plus } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useEvents } from '../lib/data';
import { Card, EmptyState, ErrorState, ListSkeleton, Money } from '../components/ui';
import { FloatingAction, Page } from '../components/Shell';

export default function Events() {
  const { t, date } = useI18n();
  const q = useEvents();
  return (
    <Page title={t('ev.title')} back="/more">
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.isLoading ? <ListSkeleton /> : !q.data?.length ? (
        <EmptyState icon={<CalendarDays className="size-7" />} title={t('ev.empty')} hint={t('ev.emptyHint')} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {q.data.map((ev) => (
            <Link key={ev.id} to={`/events/${ev.id}`}>
              <Card className="flex flex-col gap-3 p-4 transition-colors hover:bg-[#fbf6ec]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-base font-extrabold">{ev.name}</span>
                    <span className="text-[13px] text-muted">{date(ev.event_date)} · {t('ev.entries', { n: ev.expense_count })}</span>
                  </div>
                  <CalendarDays className="size-5 shrink-0 text-gold-ink" aria-hidden />
                </div>
                <div className="grid grid-cols-3 gap-2 text-[13px]">
                  <div className="flex flex-col"><span className="text-muted">{t('ev.incomeTotal')}</span><Money paise={ev.income_total} tone="income" className="font-extrabold" /></div>
                  <div className="flex flex-col"><span className="text-muted">{t('ev.expenseTotal')}</span><Money paise={ev.expense_total} tone="expense" className="font-extrabold" /></div>
                  <div className="flex flex-col"><span className="text-muted">{t('ev.net')}</span><span className="tabular font-extrabold">{ev.income_total - ev.expense_total < 0 ? '−' : ''}<Money paise={Math.abs(ev.income_total - ev.expense_total)} /></span></div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <div className="h-16" />
      <FloatingAction to="/events/new" label={t('ev.new')} icon={<Plus className="size-5" strokeWidth={2.4} />} />
    </Page>
  );
}
