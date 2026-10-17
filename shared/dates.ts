/**
 * Date helpers. Business dates are stored as plain calendar dates (YYYY-MM-DD)
 * interpreted in Asia/Kolkata; timestamps are stored as UTC and displayed in IST.
 */

export const TIMEZONE = 'Asia/Kolkata';

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Today's date in India as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return ymdFormatter.format(now);
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type DateFormat = 'DD MMM YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

/** "2026-10-16" -> "16 Oct 2026" */
export function formatDate(iso: string | null | undefined, format: DateFormat = 'DD MMM YYYY'): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  if (format === 'DD/MM/YYYY') return `${d}/${m}/${y}`;
  if (format === 'YYYY-MM-DD') return `${y}-${m}-${d}`;
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** Timestamp (ISO, UTC) -> "16 Oct 2026, 4:05 pm" in IST */
export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TIMEZONE, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(ts));
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export type PeriodKey = 'this_month' | 'last_month' | 'this_year' | 'all' | 'custom';

export interface DateRange {
  from: string | null;
  to: string | null;
}

/** Resolve a named period into an inclusive date range, using the IST calendar. */
export function periodRange(period: PeriodKey, today: string = todayIST(), custom?: DateRange): DateRange {
  const [y, m] = today.split('-').map(Number);
  switch (period) {
    case 'this_month':
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}` };
    case 'last_month': {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return { from: `${ly}-${pad(lm)}-01`, to: `${ly}-${pad(lm)}-${pad(lastDayOfMonth(ly, lm))}` };
    }
    case 'this_year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'custom':
      return { from: custom?.from ?? null, to: custom?.to ?? null };
    default:
      return { from: null, to: null };
  }
}
