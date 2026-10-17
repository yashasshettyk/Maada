/** Amount in Kannada words: 500000 paise -> "ಐದು ಸಾವಿರ ರೂಪಾಯಿಗಳು ಮಾತ್ರ". */

const ONES = [
  'ಸೊನ್ನೆ', 'ಒಂದು', 'ಎರಡು', 'ಮೂರು', 'ನಾಲ್ಕು', 'ಐದು', 'ಆರು', 'ಏಳು', 'ಎಂಟು', 'ಒಂಬತ್ತು', 'ಹತ್ತು',
  'ಹನ್ನೊಂದು', 'ಹನ್ನೆರಡು', 'ಹದಿಮೂರು', 'ಹದಿನಾಲ್ಕು', 'ಹದಿನೈದು', 'ಹದಿನಾರು', 'ಹದಿನೇಳು', 'ಹದಿನೆಂಟು', 'ಹತ್ತೊಂಬತ್ತು',
];
const TENS = ['', '', 'ಇಪ್ಪತ್ತು', 'ಮೂವತ್ತು', 'ನಲವತ್ತು', 'ಐವತ್ತು', 'ಅರವತ್ತು', 'ಎಪ್ಪತ್ತು', 'ಎಂಬತ್ತು', 'ತೊಂಬತ್ತು'];
/** Vowel-sign endings that join a tens word ("ಇಪ್ಪತ್ತ" + "ೊಂದು" = "ಇಪ್ಪತ್ತೊಂದು"). */
const JOIN: Record<number, string> = { 1: 'ೊಂದು', 2: 'ೆರಡು', 5: 'ೈದು', 6: 'ಾರು', 7: 'ೇಳು', 8: 'ೆಂಟು', 9: 'ೊಂಬತ್ತು' };
const HUNDREDS = ['', 'ನೂರು', 'ಇನ್ನೂರು', 'ಮುನ್ನೂರು', 'ನಾನೂರು', 'ಐನೂರು', 'ಆರುನೂರು', 'ಏಳುನೂರು', 'ಎಂಟುನೂರು', 'ಒಂಬೈನೂರು'];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  const word = TENS[t];
  if (o === 0) return word;
  const stem = word.slice(0, -1); // drop final "ು"
  if (o === 3 || o === 4) return word.slice(0, -2) + ONES[o]; // ಇಪ್ಪತ್ + ಮೂರು
  return stem + JOIN[o];
}

/** "ನೂರು" becomes "ನೂರ" when more follows (ಆರುನೂರ ಮೂವತ್ತೈದು). */
function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (!h) return belowHundred(r);
  if (!r) return HUNDREDS[h];
  return `${HUNDREDS[h].slice(0, -1)} ${belowHundred(r)}`;
}

export function integerToKannadaWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('Expected a non-negative integer');
  if (n === 0) return ONES[0];
  const crore = Math.floor(n / 10_000_000);
  let rest = n % 10_000_000;
  const lakh = Math.floor(rest / 100_000);
  rest %= 100_000;
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  const groups: [number, string, string][] = [];
  if (crore) groups.push([crore, 'ಕೋಟಿ', 'ಕೋಟಿಯ']);
  if (lakh) groups.push([lakh, 'ಲಕ್ಷ', 'ಲಕ್ಷದ']);
  if (thousand) groups.push([thousand, 'ಸಾವಿರ', 'ಸಾವಿರದ']);
  const parts: string[] = [];
  groups.forEach(([value, plain, joined], i) => {
    const more = i < groups.length - 1 || rest > 0;
    const count = value >= 100 ? integerToKannadaWords(value) : belowHundred(value);
    parts.push(`${count} ${more ? joined : plain}`);
  });
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

export function amountInKannadaWords(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new RangeError('Invalid amount');
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  if (rupees === 0 && p === 0) return 'ಸೊನ್ನೆ ರೂಪಾಯಿಗಳು ಮಾತ್ರ';
  if (rupees === 0) return `${belowHundred(p)} ಪೈಸೆ ಮಾತ್ರ`;
  const base = `${integerToKannadaWords(rupees)} ರೂಪಾಯಿಗಳು`;
  return p ? `${base} ಮತ್ತು ${belowHundred(p)} ಪೈಸೆ ಮಾತ್ರ` : `${base} ಮಾತ್ರ`;
}

const MONTHS_KN = ['ಜನವರಿ', 'ಫೆಬ್ರವರಿ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿಲ್', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗಸ್ಟ್', 'ಸೆಪ್ಟೆಂಬರ್', 'ಅಕ್ಟೋಬರ್', 'ನವೆಂಬರ್', 'ಡಿಸೆಂಬರ್'];

/** "2026-10-16" -> "16 ಅಕ್ಟೋಬರ್ 2026" */
export function formatDateKannada(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${MONTHS_KN[Number(m) - 1]} ${y}`;
}
