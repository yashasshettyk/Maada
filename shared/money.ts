/**
 * Money helpers. All amounts are integer paise (1 rupee = 100 paise) so that
 * arithmetic is exact. Never use floating point rupee values for storage or sums.
 */

/** ₹1,000 crore — a sanity ceiling for any single amount. */
export const MAX_AMOUNT_PAISE = 1_000_000_000_000;

export function isValidPaise(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_AMOUNT_PAISE;
}

/** Group an integer string using the Indian numbering system: 12,34,56,789. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

/** 5000000 paise -> "₹50,000.00" */
export function formatINR(paise: number, opts: { symbol?: boolean; decimals?: boolean } = {}): string {
  const { symbol = true, decimals = true } = opts;
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  let out = groupIndian(String(rupees));
  if (decimals) out += '.' + fraction;
  return (negative ? '-' : '') + (symbol ? '₹' : '') + out;
}

/** Compact form for chart axes: ₹1.2L, ₹3.4Cr, ₹12K */
export function formatINRCompact(paise: number): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

/**
 * Parse user input such as "50,000", "₹1,234.5" or "99.05" into paise without
 * floating point. Returns null for anything that is not a valid non-negative amount
 * with at most two decimal places.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return isValidPaise(paise) ? paise : null;
}

/** Paise -> plain editable string ("1234.50" or "1234" when whole). */
export function paiseToInput(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const frac = paise % 100;
  return frac === 0 ? String(rupees) : `${rupees}.${String(frac).padStart(2, '0')}`;
}

export function sumPaise(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
