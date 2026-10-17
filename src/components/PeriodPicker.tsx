import { useState } from 'react';
import { periodRange, todayIST, type DateRange, type PeriodKey } from '../../shared/dates';
import { useI18n } from '../lib/i18n';
import { Button, Chips, Field, Sheet, TextInput } from './ui';

export interface PeriodState { key: PeriodKey; custom: DateRange }

export function usePeriod(initial: PeriodKey = 'this_month') {
  const [state, setState] = useState<PeriodState>({ key: initial, custom: { from: null, to: null } });
  const range = periodRange(state.key, todayIST(), state.custom);
  return { state, setState, range };
}

export function PeriodPicker({ state, setState, include = ['this_month', 'last_month', 'this_year', 'all', 'custom'] }: {
  state: PeriodState; setState: (s: PeriodState) => void; include?: PeriodKey[];
}) {
  const { t, date } = useI18n();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(state.custom.from ?? '');
  const [to, setTo] = useState(state.custom.to ?? todayIST());
  const options = include.map((k) => ({
    value: k,
    label: k === 'custom' && state.key === 'custom' && state.custom.from ? `${date(state.custom.from)} – ${date(state.custom.to)}` : t(`period.${k}`),
  }));
  return (
    <>
      <Chips label={t('common.filters')} options={options} value={state.key}
        onChange={(k) => (k === 'custom' ? setOpen(true) : setState({ ...state, key: k }))} />
      <Sheet open={open} onClose={() => setOpen(false)} title={t('period.custom')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.from')} htmlFor="pf"><TextInput id="pf" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label={t('common.to')} htmlFor="pt"><TextInput id="pt" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <Button block className="mt-5" disabled={!from || !to || from > to}
          onClick={() => { setState({ key: 'custom', custom: { from, to } }); setOpen(false); }}>
          {t('common.apply')}
        </Button>
      </Sheet>
    </>
  );
}
