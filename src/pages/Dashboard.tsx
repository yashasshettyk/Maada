import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowUpRight, FileText, Flame, HandHeart, Minus, Plus, Settings2 } from 'lucide-react';
import { get, qs } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatINR, formatINRCompact } from '../../shared/money';
import { monthLabel } from '../../shared/dates';
import { Card, EmptyState, ErrorState, IconButton, List, ListSkeleton, Money, SectionTitle, Segmented, Skeleton } from '../components/ui';
import { PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { TxRow, type TxItem } from '../components/rows';

interface DashboardData {
  balance: number;
  opening: { amount: number; date: string } | null;
  period: { received: number; spent: number };
  pending: { amount: number; count: number };
  recent: TxItem[];
}

function Hero({ data }: { data?: DashboardData }) {
  const { t, date } = useI18n();
  return (
    <section className="relative overflow-hidden rounded-[26px] bg-[radial-gradient(ellipse_70%_90%_at_15%_10%,rgba(226,156,84,0.32),transparent_60%),linear-gradient(160deg,#4a1418,#3a1013_70%)] px-5 pb-5 pt-5 text-white shadow-[0_12px_30px_rgb(58_16_19/0.28)]">
      <img src={`${import.meta.env.BASE_URL}branding/maada-temple.webp`} alt="" aria-hidden
        className="pointer-events-none absolute -right-6 -bottom-8 w-[150px] opacity-[0.22] sm:w-[180px]" />
      <div className="relative flex flex-col gap-1">
        <div className="text-[13px] font-semibold tracking-wide text-gold-light">{t('dash.balance')}</div>
        {data ? (
          <div className="tabular text-[34px] font-extrabold leading-tight tracking-tight sm:text-[40px]">{formatINR(data.balance)}</div>
        ) : <Skeleton className="my-1.5 h-9 w-48 !bg-white/15" />}
        <div className="my-2.5 h-px bg-gold-light/30" />
        {data?.opening ? (
          <div className="text-[13px] text-[#f1e6d2]">{t('dash.openingSince', { amount: formatINR(data.opening.amount), date: date(data.opening.date) })}</div>
        ) : data ? (
          <Link to="/settings#opening" className="text-[13px] font-bold text-gold-light underline underline-offset-4">{t('dash.noOpening')}</Link>
        ) : <Skeleton className="h-4 w-40 !bg-white/15" />}
      </div>
    </section>
  );
}

function Metric({ label, value, tone, icon }: { label: string; value?: number; tone: 'income' | 'expense'; icon: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
        <span className={tone === 'income' ? 'flex size-7 items-center justify-center rounded-lg bg-income-bg text-income' : 'flex size-7 items-center justify-center rounded-lg bg-expense-bg text-expense'}>{icon}</span>
        {label}
      </div>
      {value === undefined ? <Skeleton className="h-6 w-24" /> : <Money paise={value} tone={tone} className="text-[19px] font-extrabold sm:text-xl" />}
    </Card>
  );
}

function QuickActions() {
  const { t } = useI18n();
  const items = [
    { to: '/donations/new', label: t('qa.donation'), icon: <HandHeart className="size-6" />, primary: true },
    { to: '/seves/receipt', label: t('qa.seve'), icon: <Flame className="size-6" /> },
    { to: '/expenses/new', label: t('qa.expense'), icon: <Minus className="size-6 text-expense" strokeWidth={2.4} /> },
    { to: '/income/new', label: t('qa.income'), icon: <Plus className="size-6 text-income" strokeWidth={2.4} /> },
    { to: '/events', label: t('qa.bill'), icon: <FileText className="size-6" /> },
  ];
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>{t('dash.quick')}</SectionTitle>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:grid sm:grid-cols-5">
        {items.map((a) => (
          <Link key={a.to} to={a.to} className="flex w-[78px] shrink-0 flex-col items-center gap-2 rounded-2xl py-1 text-center sm:w-auto">
            <span className={a.primary ? 'flex size-14 items-center justify-center rounded-[18px] bg-maroon text-white shadow-[0_6px_14px_rgb(100_30_43/0.25)]' : 'flex size-14 items-center justify-center rounded-[18px] bg-beige text-maroon'}>{a.icon}</span>
            <span className="text-xs font-bold leading-tight text-ink">{a.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Chart({ from, to }: { from: string | null; to: string | null }) {
  const { t, lang } = useI18n();
  const [g, setG] = useState<'day' | 'month' | 'year'>('month');
  const q = useQuery({
    queryKey: ['chart', g, from, to],
    queryFn: () => get<{ items: { bucket: string; income: number; expense: number }[] }>(`/dashboard/chart${qs({ granularity: g, from, to })}`),
  });
  const label = (b: string) => (g === 'month' ? monthLabel(b) : g === 'day' ? `${Number(b.slice(8))} ${monthLabel(b.slice(0, 7)).slice(0, 3)}` : b);
  const data = (q.data?.items ?? []).map((d) => ({ ...d, label: label(d.bucket) }));
  return (
    <Card className="flex flex-col gap-3 px-3 pb-3 pt-4 sm:px-4">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-[15px] font-extrabold">{t('dash.chart')}</h2>
        <Segmented label={t('dash.chart')} value={g} onChange={setG}
          options={[{ value: 'day', label: t('period.day') }, { value: 'month', label: t('period.month') }, { value: 'year', label: t('period.year') }]} />
      </div>
      <div className="flex gap-4 px-1 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-[#27835B]" />{t('dash.income')}</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-[#C34A4A]" />{t('dash.expenses')}</span>
      </div>
      <div className="h-52" role="img" aria-label={t('dash.chart')}>
        {q.isLoading ? <Skeleton className="h-full w-full" /> : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">{t('dash.noChart')}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.slice(-12)} margin={{ top: 4, right: 4, bottom: 0, left: -8 }} barGap={2}>
              <CartesianGrid vertical={false} stroke="#EFE7D8" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6B6763' }} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 10, fill: '#6B6763' }} tickFormatter={(v) => formatINRCompact(v)} />
              <Tooltip cursor={{ fill: 'rgba(184,148,85,0.12)' }}
                formatter={(v, name) => [formatINR(Number(v)), name === 'income' ? t('dash.income') : t('dash.expenses')]}
                contentStyle={{ borderRadius: 12, border: '1px solid #ECE3D3', fontSize: 13, fontFamily: lang === 'kn' ? 'Noto Sans Kannada' : 'Manrope Variable' }} />
              <Bar dataKey="income" fill="#27835B" radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="expense" fill="#C34A4A" radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { state, setState, range } = usePeriod('this_month');
  const q = useQuery({ queryKey: ['dashboard', range.from, range.to], queryFn: () => get<DashboardData>(`/dashboard${qs(range)}`) });
  const d = q.data;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <header className="safe-top flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-oxblood">
            <img src={`${import.meta.env.BASE_URL}branding/maada-temple.webp`} alt="" className="mt-2 w-10" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-[family-name:var(--font-serif-kn)] text-[18px] font-bold leading-tight text-maroon">{t('app.name')}</div>
            <div className="truncate text-xs text-muted">{t('app.subtitle')}</div>
          </div>
        </div>
        <IconButton label={t('set.title')} onClick={() => navigate('/settings')}><Settings2 className="size-[22px]" /></IconButton>
      </header>
      <main className="flex flex-col gap-5 px-4 pb-8 pt-1">
        <Hero data={d} />
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        <PeriodPicker state={state} setState={setState} />
        <div className="grid grid-cols-2 gap-2.5">
          <Metric label={t('dash.received')} value={d?.period.received} tone="income" icon={<ArrowDownLeft className="size-4" strokeWidth={2.4} />} />
          <Metric label={t('dash.spent')} value={d?.period.spent} tone="expense" icon={<ArrowUpRight className="size-4" strokeWidth={2.4} />} />
          <Link to="/seves" className="col-span-2">
            <Card className="flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-ink-soft">{t('dash.pending')}</span>
                <span className="text-xs text-muted">{d ? t('dash.pendingCount', { n: d.pending.count }) : '…'}</span>
              </div>
              {d ? <Money paise={d.pending.amount} tone="pending" className="text-[19px] font-extrabold" /> : <Skeleton className="h-6 w-24" />}
            </Card>
          </Link>
        </div>
        <QuickActions />
        <Chart from={range.from} to={range.to} />
        <section className="flex flex-col gap-1.5">
          <SectionTitle action={<Link to="/accounts" className="flex min-h-11 items-center text-sm font-bold text-maroon">{t('common.seeAll')}</Link>}>{t('dash.recent')}</SectionTitle>
          {!d ? <ListSkeleton rows={4} /> : d.recent.length === 0 ? (
            <EmptyState icon={<HandHeart className="size-7" />} title={t('dash.noActivity')} hint={t('dash.noActivityHint')} />
          ) : (
            <List>{d.recent.map((tx) => <TxRow key={tx.id} tx={tx} />)}</List>
          )}
        </section>
      </main>
    </div>
  );
}
