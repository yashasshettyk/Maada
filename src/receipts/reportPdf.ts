import { ensureFonts, setFont, text, wrap } from './canvas';

export interface PdfTable { title: string; columns: string[]; rows: (string | number)[][]; numeric?: boolean[] }

/**
 * Render a simple multi-page A4 report onto canvases (so Kannada names print correctly)
 * and bundle the pages into a PDF.
 */
export async function reportPdf(title: string, subtitle: string, tables: PdfTable[]): Promise<Blob> {
  await ensureFonts();
  const { jsPDF } = await import('jspdf');
  const W = 794; // A4 at 96 dpi
  const H = 1123;
  const S = 2;
  const M = 48;
  const pages: HTMLCanvasElement[] = [];
  let ctx!: CanvasRenderingContext2D;
  let y = 0;
  const newPage = () => {
    const c = document.createElement('canvas');
    c.width = W * S; c.height = H * S;
    ctx = c.getContext('2d')!;
    ctx.scale(S, S);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#4A1418'; ctx.fillRect(0, 0, W, 6);
    pages.push(c);
    y = M;
    if (pages.length === 1) {
      text(ctx, title, M, y + 14, { family: 'serif-kn', size: 24, weight: 800, color: '#641E2B' });
      text(ctx, subtitle, M, y + 44, { family: 'manrope', size: 12, weight: 500, color: '#6B6763' });
      y += 72;
    }
  };
  const ensure = (h: number) => { if (y + h > H - M) newPage(); };
  newPage();

  for (const tb of tables) {
    ensure(70);
    text(ctx, tb.title, M, y + 12, { family: 'sans-kn', size: 15, weight: 700, color: '#292725' });
    y += 30;
    const cols = tb.columns.length;
    const firstW = (W - 2 * M) * (cols > 3 ? 0.4 : 0.5);
    const otherW = (W - 2 * M - firstW) / Math.max(cols - 1, 1);
    const colX = (i: number) => (i === 0 ? M : M + firstW + otherW * i);
    const header = () => {
      ctx.fillStyle = '#F6EEE0'; ctx.fillRect(M, y, W - 2 * M, 26);
      tb.columns.forEach((c, i) => text(ctx, c, i === 0 ? M + 8 : colX(i) - 8, y + 13, { family: 'sans-kn', size: 11, weight: 700, color: '#6A5236', align: i === 0 ? 'left' : 'right' }));
      y += 26;
    };
    header();
    if (!tb.rows.length) {
      text(ctx, '—', M + 8, y + 14, { family: 'manrope', size: 12, color: '#8A7356' });
      y += 28;
    }
    for (const row of tb.rows) {
      const lines = wrap(ctx, String(row[0]), firstW - 16, { family: 'sans-kn', size: 12, color: '#292725' }, 2);
      const h = 10 + lines.length * 17;
      if (y + h > H - M) { newPage(); header(); }
      lines.forEach((ln, j) => text(ctx, ln, M + 8, y + 13 + j * 17, { family: 'sans-kn', size: 12, weight: 500, color: '#292725' }));
      row.slice(1).forEach((v, i) => text(ctx, String(v), colX(i + 1) - 8, y + 13, { family: 'manrope', size: 12, weight: 600, color: '#292725', align: 'right' }));
      y += h;
      ctx.fillStyle = '#EFE7D8'; ctx.fillRect(M, y - 0.5, W - 2 * M, 1);
    }
    y += 24;
  }
  // Page numbers
  pages.forEach((c, i) => {
    const g = c.getContext('2d')!;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    setFont(g, { family: 'manrope', size: 11 * S, color: '#8A7356', align: 'right' });
    g.fillText(`${i + 1} / ${pages.length}`, (W - M) * S, (H - 24) * S);
    g.restore();
  });
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  pages.forEach((c, i) => {
    if (i) doc.addPage();
    doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 595.28, 841.89, undefined, 'FAST');
  });
  return doc.output('blob');
}

export function toCsv(columns: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM so Excel opens Kannada text correctly.
  return '﻿' + [columns, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
