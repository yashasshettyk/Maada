/** Converts amounts to Indian-English words: "Rupees Twelve Lakh Five Thousand Only". */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t}-${o}` : t;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(belowHundred(r));
  return parts.join(' ');
}

/** Integer (>= 0) to words using crore / lakh / thousand grouping. */
export function integerToIndianWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('Expected a non-negative integer');
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  let rest = n % 10_000_000;
  if (crore) parts.push(`${integerToIndianWords(crore)} Crore`);
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

/** 500000 paise -> "Rupees Five Thousand Only"; 12350 -> "Rupees One Hundred Twenty-Three and Fifty Paise Only" */
export function amountInWords(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new RangeError('Invalid amount');
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  if (rupees === 0 && p === 0) return 'Rupees Zero Only';
  if (rupees === 0) return `${belowHundred(p)} Paise Only`;
  const base = `Rupees ${integerToIndianWords(rupees)}`;
  return p ? `${base} and ${belowHundred(p)} Paise Only` : `${base} Only`;
}
