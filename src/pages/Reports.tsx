import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Sheet as SheetIcon } from 'lucide-react';
import { get, qs } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatINR, paiseToInput } from '../../shared/money';
import { monthLabel } from '../../shared/dates';
import type { StringKey } from '../lib/strings';
import { Button, Card, ErrorState, IconButton, Money, SectionTitle, Skeleton, useToast } from '../components/ui';
import { Page } from '../components/Shell';
import { PeriodPicker, usePeriod } from '../components/PeriodPicker';
import { reportPdf, toCsv, type PdfTable } from '../receipts/reportPdf';
import { downloadText, saveFile } from '../lib/native';

interface Table { key: string; title: string; columns: string[]; rows: (string | number)[][]; money: number[] }

function TableCard({ table, onCsv }: { table: Table; onCsv: () => void }) {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-1.5">
      <SectionTitle action={<IconButton label={`${t('rep.csv')} · ${table.title}`} onClick={onCsv}><SheetIcon className="size-5 text-gold-ink" /></IconButton>}>{table.title}</SectionTitle>
      <Card className="overflow-x-auto">
        {table.rows.length === 0 ? <p className="px-4 py-5 text-sm text-muted">{t('rep.none')}</p> : (
          <table className="w-full min-w-[320px] text-[13px]">
            <thead>
              <tr className="border-b border-[#f1ebdf] text-left text-[11px] uppercase tracking-wider text-muted">
                {table.columns.map((c, i) => <th key={c} scope="col" className={`px-4 py-2.5 font-extrabold ${i ? 'text-right' : ''}`}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, ri) => (
                <tr key={ri} className="border-b border-[#f6f1e7] last:border-0">
                  {r.map((v, i) => (
                    <td key={i} className={`px-4 py-2.5 ${i ? 'tabular text-right font-semibold' : 'font-semibold'}`}>
                      {table.money.includes(i) ? <Money paise={Number(v)} /> : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
}

export default function Reports() {
  const { t, date } = useI18n();
  const toast = useToast();
  const { state, setState, range } = usePeriod('this_year');
  const q = useQuery({ queryKey: ['reports', range.from, range.to], queryFn: () => get(`/reports${qs(range)}`) });
  const [busy, setBusy] = useState(false);
  const d = q.data;
  const src = (k: string) => t(`src.${k}` as StringKey);

  const tables: Table[] = d ? [
    { key: 'monthly', title: t('rep.monthly'), columns: [t('rep.month'), t('dash.income'), t('dash.expenses')], money: [1, 2], rows: d.monthly.map((m: any) => [monthLabel(m.label), m.income, m.expense]) },
    { key: 'annual', title: t('rep.annual'), columns: [t('rep.year'), t('dash.income'), t('dash.expenses')], money: [1, 2], rows: d.annual.map((m: any) => [m.label, m.income, m.expense]) },
    { key: 'sources', title: t('rep.incomeSources'), columns: [t('tx.type'), t('common.total')], money: [1], rows: d.incomeBySource.map((m: any) => [src(m.label), m.total]) },
    { key: 'purpose', title: t('rep.byPurpose'), columns: [t('don.purpose'), t('common.total')], money: [1], rows: d.byPurpose.map((m: any) => [m.label, m.total]) },
    { key: 'donors', title: t('rep.topDonors'), columns: [t('don.donor'), t('common.total')], money: [1], rows: d.topDonors.map((m: any) => [m.label, m.total]) },
    { key: 'ritual', title: t('rep.ritual'), columns: [t('seve.seve'), t('rep.prescribed'), t('rep.collected'), t('seve.pending')], money: [1, 2, 3], rows: d.ritualCollection.map((m: any) => [`${m.label} (${m.count})`, m.prescribed, m.collected, m.pending]) },
    { key: 'pending', title: t('rep.pending'), columns: [t('seve.devotee'), t('seve.date'), t('seve.pending')], money: [2], rows: d.pendingList.map((m: any) => [`${m.devotee_name} · ${m.ritual_name}`, date(m.ritual_date), m.pending]) },
    { key: 'events', title: t('rep.events'), columns: [t('common.event'), t('common.total')], money: [1], rows: d.eventExpenses.map((m: any) => [m.label, m.total]) },
    { key: 'categories', title: t('rep.categories'), columns: [t('common.category'), t('common.total')], money: [1], rows: d.categoryExpenses.map((m: any) => [m.label, m.total]) },
  ] : [];

  const periodText = range.from ? `${date(range.from)} – ${date(range.to)}` : t('period.all');
  const plain = (tb: Table) => tb.rows.map((r) => r.map((v, i) => (tb.money.includes(i) ? paiseToInput(Number(v)) : v)));
  const csv = async (tb: Table) => {
    const where = await downloadText(toCsv(tb.columns, plain(tb)), `maada-${tb.key}-${range.from ?? 'all'}.csv`);
    toast(t('rcpt.savedTo', { place: where }));
  };
  const pdf = async () => {
    if (!d) return;
    setBusy(true);
    try {
      const summary: PdfTable = {
        title: t('rep.overall'), columns: ['', t('common.amount')],
        rows: [[t('rep.opening'), formatINR(d.opening)], [t('rep.income'), formatINR(d.totals.income)], [t('rep.expense'), formatINR(d.totals.expense)], [t('rep.balance'), formatINR(d.balance)]],
      };
      const blob = await reportPdf(`${t('rep.title')} · ${t('app.name')}`, periodText, [summary, ...tables.map((tb) => ({
        title: tb.title, columns: tb.columns, rows: tb.rows.map((r) => r.map((v, i) => (tb.money.includes(i) ? formatINR(Number(v)) : v))),
      }))]);
      toast(t('rcpt.savedTo', { place: await saveFile(blob, `maada-report-${range.from ?? 'all'}.pdf`) }));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t('rep.title')} back="/more" actions={<Button size="sm" variant="secondary" icon={<FileDown className="size-4" />} loading={busy} disabled={!d} onClick={pdf}>{t('rep.pdf')}</Button>}>
      <PeriodPicker state={state} setState={setState} />
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !d ? <Skeleton className="h-64 w-full" /> : (
        <>
          <Card className="grid grid-cols-2 gap-x-3 gap-y-4 p-5">
            <div className="flex flex-col gap-1"><span className="text-xs text-muted">{t('rep.income')}</span><Money paise={d.totals.income} tone="income" className="text-lg font-extrabold" /></div>
            <div className="flex flex-col gap-1"><span className="text-xs text-muted">{t('rep.expense')}</span><Money paise={d.totals.expense} tone="expense" className="text-lg font-extrabold" /></div>
            <div className="flex flex-col gap-1"><span className="text-xs text-muted">{t('rep.opening')}</span><Money paise={d.opening} className="text-lg font-extrabold" /></div>
            <div className="flex flex-col gap-1"><span className="text-xs text-muted">{t('rep.balance')}</span><Money paise={d.balance} className="text-lg font-extrabold text-maroon" /></div>
          </Card>
          {tables.map((tb) => <TableCard key={tb.key} table={tb} onCsv={() => csv(tb)} />)}
        </>
      )}
    </Page>
  );
}
