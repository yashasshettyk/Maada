import { formatINR } from '../../shared/money';
import { formatDateKannada } from '../../shared/words-kn';
import { formatDate } from '../../shared/dates';
import {
  type Ctx, type TextStyle, divider, ellipseGradient, ensureFonts, fitSize, lattice, linearV, loadImage, lotus, measure, sunMoon, text, wrap,
} from './canvas';

export interface ReceiptRecord {
  receipt_number: string;
  receipt_type: 'donation' | 'ritual_payment' | 'expense_bill';
  status: 'issued' | 'cancelled';
  issue_date: string;
  snapshot_data: Record<string, any>;
}

export interface Rendered { canvas: HTMLCanvasElement; width: number; height: number }

const SCALE = 2;
let temple: Promise<HTMLImageElement> | null = null;
const templeUrl = `${import.meta.env.BASE_URL}branding/maada-temple.webp`;
const templeImage = () => (temple ??= loadImage(templeUrl).catch((e) => { temple = null; throw e; }));

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * SCALE);
  canvas.height = Math.round(h * SCALE);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

const LABEL: TextStyle = { family: 'sans-kn', size: 15, weight: 400, color: '#7A6650', align: 'center' };

/** Diagonal stamp across a cancelled receipt, so a cancelled copy can never pass as valid. */
function cancelledStamp(ctx: Ctx, cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.32);
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = '#B23E3E';
  ctx.lineWidth = 4;
  const w = 470;
  const h = 96;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16);
  text(ctx, 'ರದ್ದಾಗಿದೆ · CANCELLED', 0, 2, { family: 'sans-kn', size: 34, weight: 700, color: '#B23E3E', align: 'center', letterSpacing: 2 });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Donation & seve receipts (landscape, 3:2)
// ---------------------------------------------------------------------------

export async function renderLandscapeReceipt(r: ReceiptRecord): Promise<Rendered> {
  await ensureFonts();
  const img = await templeImage().catch(() => null);
  const s = r.snapshot_data;
  const W = 1350;
  const H = 900;
  const { canvas, ctx } = makeCanvas(W, H);
  const isSeve = r.receipt_type === 'ritual_payment';

  // Paper
  ctx.fillStyle = '#FAF7F0';
  ctx.fillRect(0, 0, W, H);

  // Left panel: deep oxblood with a lamp-like glow behind the temple
  const P: [number, number, number, number] = [0, 0, 500, H];
  linearV(ctx, P, [[0, '#3A1013'], [0.34, '#4A1418'], [0.6, '#571B1D'], [0.82, '#4E171A'], [1, '#3A1013']]);
  ellipseGradient(ctx, P, 250, 360, 600, 810, [[0, 'rgba(20,4,6,0)'], [0.55, 'rgba(20,4,6,0)'], [1, 'rgba(20,4,6,0.38)']]);
  ellipseGradient(ctx, P, 260, 900, 360, 120, [[0, 'rgba(226,150,80,0.34)'], [1, 'rgba(226,150,80,0)']]);
  ellipseGradient(ctx, P, 250, 320, 340, 380, [[0, 'rgba(226,156,84,0.42)'], [0.48, 'rgba(172,82,48,0.2)'], [1, 'rgba(120,40,30,0)']]);
  lattice(ctx, P, '#D8B878', 0.06);
  // Halo behind the roof
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = '#D8B878';
  ctx.lineWidth = 1.44;
  ctx.translate(10, 60);
  ctx.scale(2.4, 2.4);
  ctx.lineWidth = 0.6;
  for (const radius of [98, 91, 68, 44]) { ctx.beginPath(); ctx.arc(100, 100, radius, 0, Math.PI * 2); ctx.stroke(); }
  ctx.stroke(new Path2D('M100 2v196M2 100h196M31 31l138 138M169 31 31 169'));
  ctx.restore();
  sunMoon(ctx, 18, 18);
  ctx.fillStyle = '#C9A35E';
  ctx.fillRect(491, 0, 2, H);
  ctx.fillStyle = '#FAF7F0';
  ctx.fillRect(493, 0, 7, H);

  // Right panel frame
  ctx.strokeStyle = '#B89455';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(500 + 22.75, 22.75, 850 - 45.5, H - 45.5);
  ctx.strokeStyle = '#DCC9A2';
  ctx.lineWidth = 1;
  ctx.strokeRect(500 + 29.5, 29.5, 850 - 59, H - 59);

  // Content column
  const L = 630;
  const R = 1268;
  const CX = (L + R) / 2;
  const CW = R - L;

  // Top row
  const rowY = 62 + 11;
  const label = (x: number, y: number, a: string, b: string, align: 'left' | 'right') => {
    const la = measure(ctx, a, { ...LABEL, align: 'left' });
    const lb = measure(ctx, b, { family: 'sans-kn', size: 15, weight: 700, color: '#292725' });
    const start = align === 'left' ? x : x - la - 6 - lb;
    text(ctx, a, start, y, { ...LABEL, align: 'left' });
    text(ctx, b, start + la + 6, y, { family: 'sans-kn', size: 15, weight: 700, color: '#292725' });
  };
  label(L, rowY, 'ರಸೀದಿ ಸಂಖ್ಯೆ', r.receipt_number, 'left');
  label(R, rowY, 'ದಿನಾಂಕ', formatDateKannada(s.date), 'right');

  // Heading block
  let y = 62 + 22 + 26;
  lotus(ctx, CX - 32, y, 64, '#B89455');
  y += 30 + 10;
  const title: TextStyle = { family: 'serif-kn', size: 46, weight: 800, color: '#641E2B', align: 'center' };
  title.size = fitSize(ctx, s.institution_name_kn, CW, title, 30);
  text(ctx, s.institution_name_kn, CX, y + 31, title);
  y += 62 + 8;
  divider(ctx, CX, y + 3, 300, '#B89455');
  y += 6 + 10;
  const sub: TextStyle = { family: 'serif-kn', size: isSeve ? 30 : 24, weight: 700, color: '#8A6A35', align: 'center', letterSpacing: 1 };
  sub.size = fitSize(ctx, s.title_kn, CW, sub, 18);
  text(ctx, s.title_kn, CX, y + (sub.size * 1.5) / 2, sub);
  const headEnd = y + sub.size * 1.5;

  // Body blocks, measured first so the free space can be split evenly
  const nameStyle: TextStyle = { family: 'serif-kn', size: 36, weight: 700, color: '#292725', align: 'center' };
  nameStyle.size = fitSize(ctx, s.name, CW, nameStyle, 24);
  const nameLines = wrap(ctx, s.name, CW, nameStyle, 2);
  const nameH = 22 + nameLines.length * nameStyle.size * 1.4;

  const amountStyle: TextStyle = { family: 'serif-kn', size: 64, weight: 800, color: '#641E2B', align: 'center' };
  const wordsStyle: TextStyle = { family: 'serif-kn', size: 20, weight: 500, color: '#4A3A33', align: 'center' };
  const wordLines = wrap(ctx, s.amount_words_kn, 520, wordsStyle, 2);
  const amountH = 16 + 22 + 77 + wordLines.length * 30 + 18;

  const third = isSeve ? formatDateKannada(s.seve_date) : (s.purpose ?? '');
  const thirdStyle: TextStyle = { family: 'sans-kn', size: 20, weight: 600, color: '#292725', align: 'center' };
  const thirdLines = wrap(ctx, third, CW, thirdStyle, 2);
  const thirdH = 22 + thirdLines.length * 30;

  const ackStyle: TextStyle = { family: 'serif-kn', size: 17, weight: 500, color: '#5A3A3F', align: 'center' };
  const ackLines = wrap(ctx, s.acknowledgment_kn ?? '', 560, ackStyle, 3);
  const ackH = ackLines.length * 27.2;
  const footH = 12 + 18;

  const bottom = 846;
  const fixed = nameH + 22 + amountH + 20 + thirdH + ackH + footH;
  const gap = Math.max((bottom - headEnd - fixed) / 2, 12);

  y = headEnd + gap;
  text(ctx, isSeve ? 'ಭಕ್ತರ ಹೆಸರು' : 'ದಾನಿಗಳ ಹೆಸರು', CX, y + 11, LABEL);
  y += 22;
  for (const line of nameLines) { text(ctx, line, CX, y + (nameStyle.size * 1.4) / 2, nameStyle); y += nameStyle.size * 1.4; }

  y += 22;
  ctx.fillStyle = '#D4BC8E';
  ctx.fillRect(CX - 260, y, 520, 1);
  y += 16;
  text(ctx, isSeve ? 'ಸೇವಾ ಮೊತ್ತ' : 'ದೇಣಿಗೆ ಮೊತ್ತ', CX, y + 11, LABEL);
  y += 22;
  amountStyle.size = fitSize(ctx, formatINR(s.amount), 520, amountStyle, 40);
  text(ctx, formatINR(s.amount), CX, y + 40, amountStyle);
  y += 77;
  for (const line of wordLines) { text(ctx, line, CX, y + 15, wordsStyle); y += 30; }
  y += 18;
  ctx.fillStyle = '#D4BC8E';
  ctx.fillRect(CX - 260, y, 520, 1);

  y += 20;
  text(ctx, isSeve ? 'ಸೇವೆಯ ದಿನಾಂಕ' : 'ಉದ್ದೇಶ', CX, y + 11, LABEL);
  y += 22;
  for (const line of thirdLines) { text(ctx, line, CX, y + 15, thirdStyle); y += 30; }

  // Acknowledgement with hairlines either side, then footer
  y = bottom - footH - ackH;
  const ackWidth = Math.max(...ackLines.map((l) => measure(ctx, l, ackStyle)), 0);
  ackLines.forEach((line, i) => text(ctx, line, CX, y + i * 27.2 + 13.6, ackStyle));
  const midY = y + ackH / 2;
  ctx.fillStyle = '#DCC9A2';
  const lineGap = ackWidth / 2 + 18;
  if (CX - lineGap - L > 10) {
    ctx.fillRect(L, midY, CX - lineGap - L, 1);
    ctx.fillRect(CX + lineGap, midY, R - CX - lineGap, 1);
  }
  text(ctx, s.footer_kn ?? '', CX, bottom - 9, { family: 'sans-kn', size: 12, weight: 400, color: '#8A7356', align: 'center' });

  // Temple, in front of everything, standing on the bottom edge
  if (img) {
    ctx.save();
    ctx.shadowColor = 'rgba(30,8,10,0.42)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = -6;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(img, -133, 35, 760, 905);
    ctx.restore();
  }

  if (r.status === 'cancelled') cancelledStamp(ctx, CX, 470);
  return { canvas, width: canvas.width, height: canvas.height };
}

// ---------------------------------------------------------------------------
// Internal expense bill (portrait, scalloped bottom edge)
// ---------------------------------------------------------------------------

export async function renderExpenseBill(r: ReceiptRecord, dateFormat: Parameters<typeof formatDate>[1] = 'DD MMM YYYY'): Promise<Rendered> {
  await ensureFonts();
  const img = await templeImage().catch(() => null);
  const s = r.snapshot_data;
  const W = 720;
  const L = 40;
  const R = 680;
  const items: any[] = s.items ?? [];
  const M = (size: number, weight: number, color: string, align: CanvasTextAlign = 'left', letterSpacing = 0): TextStyle =>
    ({ family: 'manrope', size, weight, color, align, letterSpacing });

  // Measure item rows first so the bill grows with the list.
  const measureCtx = document.createElement('canvas').getContext('2d')!;
  const rows = items.map((it) => {
    const lines = wrap(measureCtx, it.title, 300, M(14, 700, '#292725'), 2);
    const h = 20 + lines.length * 19 + (it.vendor ? 17 : 0);
    return { it, lines, h };
  });
  const tableH = 30 + rows.reduce((a, b) => a + b.h, 0) + (rows.length ? 0 : 44);
  const H = Math.max(1100, 228 + 24 + 74 + 18 + 2 + 18 + tableH + 18 + 7 + 18 + 92 + 18 + 2 + 18 + 150 + 120);
  const { canvas, ctx } = makeCanvas(W, H);

  ctx.fillStyle = '#FBF8F1';
  ctx.fillRect(0, 0, W, H);

  // Header
  const HD: [number, number, number, number] = [0, 0, W, 228];
  linearV(ctx, HD, [[0, '#3A1013'], [0.45, '#4A1418'], [1, '#571B1D']]);
  ellipseGradient(ctx, HD, 360, 68, 864, 274, [[0, 'rgba(20,4,6,0)'], [0.55, 'rgba(20,4,6,0)'], [1, 'rgba(20,4,6,0.35)']]);
  ellipseGradient(ctx, HD, 130, 130, 280, 230, [[0, 'rgba(226,156,84,0.4)'], [0.5, 'rgba(172,82,48,0.16)'], [1, 'rgba(120,40,30,0)']]);
  lattice(ctx, HD, '#D8B878', 0.06);
  sunMoon(ctx, 18, 22);
  if (img) {
    ctx.save();
    ctx.beginPath(); ctx.rect(...HD); ctx.clip();
    ctx.shadowColor = 'rgba(20,4,8,0.45)'; ctx.shadowBlur = 12; ctx.shadowOffsetX = -3; ctx.shadowOffsetY = 6;
    ctx.drawImage(img, 14, 34, 204, 243);
    ctx.restore();
  }
  const hx = (232 + 688) / 2;
  const nameS: TextStyle = { family: 'serif-kn', size: 31, weight: 800, color: '#F6EAD0', align: 'center' };
  nameS.size = fitSize(ctx, s.institution_name_kn, 440, nameS, 20);
  let y = 119 + 5 - 47.5;
  text(ctx, s.institution_name_kn, hx, y + 21.5, nameS);
  y += 43 + 6;
  divider(ctx, hx, y + 3, 220, '#D8B878', 12);
  y += 6 + 6;
  text(ctx, s.title_kn, hx, y + 17, { family: 'serif-kn', size: 21, weight: 700, color: '#E2C68F', align: 'center' });
  const gold = ctx.createLinearGradient(0, 0, W, 0);
  gold.addColorStop(0, '#B89455'); gold.addColorStop(0.5, '#E2C68F'); gold.addColorStop(1, '#B89455');
  ctx.fillStyle = gold;
  ctx.fillRect(0, 225, W, 3);

  // Meta
  y = 228 + 24;
  text(ctx, 'EVENT', L, y + 7, M(11, 800, '#8A7356', 'left', 1.76));
  const evS = M(22, 800, '#641E2B');
  evS.size = fitSize(ctx, s.event_name, 360, evS, 15);
  text(ctx, s.event_name, L, y + 14 + 18, evS);
  text(ctx, `Seve date · ${formatDate(s.event_date, dateFormat)}`, L, y + 14 + 36 + 12, M(13, 400, '#5F5B57'));
  const kv = (k: string, v: string, yy: number) => {
    const vw = measure(ctx, v, M(13, 800, '#292725'));
    text(ctx, v, R, yy, M(13, 800, '#292725', 'right'));
    text(ctx, k, R - vw - 14, yy, M(13, 400, '#8A7356', 'right'));
  };
  kv('Bill No.', r.receipt_number, y + 9);
  kv('Date', formatDate(r.issue_date, dateFormat), y + 29);
  const stamp = 'INTERNAL USE ONLY';
  const sw = measure(ctx, stamp, M(11, 800, '#641E2B', 'left', 0.88)) + 20;
  ctx.strokeStyle = '#641E2B'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(R - sw + 0.5, y + 46.5, sw - 1, 22, 4); ctx.stroke();
  text(ctx, stamp, R - sw / 2, y + 58, M(11, 800, '#641E2B', 'center', 0.88));
  y += 74 + 18;

  const perforation = (yy: number) => {
    ctx.save(); ctx.strokeStyle = '#CDBB98'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke(); ctx.restore();
  };
  perforation(y + 1);
  y += 2 + 18;

  // Table
  const C = { idx: L, item: 78, qty: 486, rate: 564, amt: R };
  const head = M(11, 800, '#641E2B', 'left', 1.32);
  text(ctx, '#', C.idx, y + 8, head);
  text(ctx, 'ITEM', C.item, y + 8, head);
  text(ctx, 'QTY', C.qty, y + 8, { ...head, align: 'right' });
  text(ctx, 'RATE', C.rate, y + 8, { ...head, align: 'right' });
  text(ctx, 'AMOUNT', C.amt, y + 8, { ...head, align: 'right' });
  y += 28;
  ctx.fillStyle = '#641E2B';
  ctx.fillRect(L, y, R - L, 1.5);
  y += 2;
  if (!rows.length) {
    text(ctx, 'No items recorded for this event', (L + R) / 2, y + 22, M(14, 500, '#8A7356', 'center'));
    y += 44;
  }
  rows.forEach(({ it, lines, h }, i) => {
    const top = y + 10;
    text(ctx, String(i + 1).padStart(2, '0'), C.idx, top + 9.5, M(14, 400, '#8A7356'));
    lines.forEach((ln, j) => text(ctx, ln, C.item, top + 9.5 + j * 19, M(14, 700, '#292725')));
    if (it.vendor) text(ctx, it.vendor, C.item, top + lines.length * 19 + 8, M(12, 400, '#8A7356'));
    text(ctx, it.quantity ?? '—', C.qty, top + 9.5, M(14, 400, '#292725', 'right'));
    text(ctx, it.unit_rate != null ? formatINR(it.unit_rate, { decimals: it.unit_rate % 100 !== 0 }) : '—', C.rate, top + 9.5, M(14, 400, '#292725', 'right'));
    text(ctx, formatINR(it.amount), C.amt, top + 9.5, M(14, 800, '#292725', 'right'));
    y += h;
    if (i < rows.length - 1) {
      ctx.save(); ctx.strokeStyle = '#CDBB98'; ctx.lineWidth = 1; ctx.setLineDash([1, 3]);
      ctx.beginPath(); ctx.moveTo(L, y - 0.5); ctx.lineTo(R, y - 0.5); ctx.stroke(); ctx.restore();
    }
  });

  y += 18;
  ctx.fillStyle = '#641E2B';
  ctx.fillRect(L, y, R - L, 1);
  ctx.fillRect(L, y + 4, R - L, 1);
  y += 7 + 18;

  // Totals
  text(ctx, `${items.length} ${items.length === 1 ? 'item' : 'items'}`, L, y + 8, M(12, 400, '#8A7356'));
  text(ctx, 'AMOUNT IN WORDS', L, y + 28, M(11, 800, '#8A7356', 'left', 1.76));
  wrap(ctx, s.total_words_en ?? '', 320, M(14, 600, '#4A3A33'), 3).forEach((ln, i) => text(ctx, ln, L, y + 48 + i * 20, M(14, 600, '#4A3A33')));
  text(ctx, 'TOTAL EXPENSE', R, y + 28, M(11, 800, '#8A7356', 'right', 1.76));
  text(ctx, formatINR(s.total), R, y + 60, M(36, 800, '#641E2B', 'right', -0.7));
  y += 92 + 18;
  perforation(y + 1);
  y += 2 + 18;

  // Summary
  text(ctx, 'EVENT SUMMARY', L, y + 7, M(11, 800, '#8A7356', 'left', 1.76));
  y += 24;
  const leader = (label: string, value: string, color: string, yy: number) => {
    text(ctx, label, L, yy, M(15, 600, '#292725'));
    text(ctx, value, R, yy, M(15, 800, color, 'right'));
    const a = L + measure(ctx, label, M(15, 600, '#292725')) + 10;
    const b = R - measure(ctx, value, M(15, 800, color)) - 10;
    ctx.save(); ctx.strokeStyle = '#CDBB98'; ctx.lineWidth = 1.5; ctx.setLineDash([1.5, 3.5]);
    ctx.beginPath(); ctx.moveTo(a, yy + 6); ctx.lineTo(b, yy + 6); ctx.stroke(); ctx.restore();
  };
  leader('Income received', formatINR(s.income), '#1F7A52', y + 11);
  y += 32;
  leader('Total expense', `− ${formatINR(s.total)}`, '#B23E3E', y + 11);
  y += 36;
  ctx.fillStyle = '#4A1418';
  ctx.beginPath(); ctx.roundRect(L, y, R - L, 48, 4); ctx.fill();
  text(ctx, 'Balance', L + 16, y + 24, M(15, 700, '#E2C68F'));
  text(ctx, (s.balance < 0 ? '−' : '') + formatINR(Math.abs(s.balance)), R - 16, y + 24, M(20, 800, '#FFFFFF', 'right'));

  // Footer
  text(ctx, '✦ END OF STATEMENT ✦', W / 2, H - 40 - 30, M(12, 800, '#B89455', 'center', 3.6));
  text(ctx, 'Prepared for committee members · Computer-generated statement', W / 2, H - 40 - 9, M(12, 400, '#8A7356', 'center'));

  if (r.status === 'cancelled') cancelledStamp(ctx, W / 2, 228 + (H - 228) / 2);

  // Scalloped bottom edge: cut half-circles out of the last 7px.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let x = 10; x < W + 10; x += 20) { ctx.beginPath(); ctx.arc(x, H, 7, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();

  return { canvas, width: canvas.width, height: canvas.height };
}

export function renderReceipt(r: ReceiptRecord, dateFormat?: Parameters<typeof formatDate>[1]) {
  return r.receipt_type === 'expense_bill' ? renderExpenseBill(r, dateFormat) : renderLandscapeReceipt(r);
}
