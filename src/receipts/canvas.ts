/** Small Canvas 2D helpers used by the receipt renderers. All coordinates are in design pixels. */

export type Ctx = CanvasRenderingContext2D;

export interface TextStyle {
  family: 'serif-kn' | 'sans-kn' | 'manrope';
  size: number;
  weight?: number;
  color: string;
  align?: CanvasTextAlign;
  letterSpacing?: number;
}

const FAMILY = {
  'serif-kn': '"Noto Serif Kannada", serif',
  'sans-kn': '"Noto Sans Kannada", "Manrope Variable", sans-serif',
  manrope: '"Manrope Variable", "Noto Sans Kannada", sans-serif',
};

export function setFont(ctx: Ctx, s: TextStyle) {
  ctx.font = `${s.weight ?? 400} ${s.size}px ${FAMILY[s.family]}`;
  ctx.fillStyle = s.color;
  ctx.textAlign = s.align ?? 'left';
  ctx.textBaseline = 'middle';
  (ctx as any).letterSpacing = `${s.letterSpacing ?? 0}px`;
}

export function measure(ctx: Ctx, text: string, s: TextStyle) {
  setFont(ctx, s);
  return ctx.measureText(text).width;
}

/** Draw a single line, vertically centred on y. */
export function text(ctx: Ctx, str: string, x: number, y: number, s: TextStyle) {
  setFont(ctx, s);
  ctx.fillText(str, x, y);
}

/** Largest size (down to min) at which the text fits on one line. */
export function fitSize(ctx: Ctx, str: string, maxWidth: number, s: TextStyle, min: number) {
  let size = s.size;
  while (size > min && measure(ctx, str, { ...s, size }) > maxWidth) size -= 1;
  return size;
}

/** Break text into lines that fit maxWidth (words, then characters for very long words). */
export function wrap(ctx: Ctx, str: string, maxWidth: number, s: TextStyle, maxLines = 3): string[] {
  setFont(ctx, s);
  const words = str.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
  }
  return lines;
}

/** Fill a rect with an elliptical radial gradient centred at (cx, cy). */
export function ellipseGradient(ctx: Ctx, rect: [number, number, number, number], cx: number, cy: number, rx: number, ry: number, stops: [number, string][]) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(...rect);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.scale(rx / ry, 1);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, ry);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  const [x, y, w, h] = rect;
  ctx.fillRect((x - cx) * (ry / rx), y - cy, w * (ry / rx), h);
  ctx.restore();
}

export function linearV(ctx: Ctx, rect: [number, number, number, number], stops: [number, string][]) {
  const [x, y, w, h] = rect;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** The faint diamond lattice used on the maroon panels. */
export function lattice(ctx: Ctx, rect: [number, number, number, number], color: string, alpha: number) {
  const [x0, y0, w, h] = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  for (let y = y0; y < y0 + h; y += 34) {
    for (let x = x0; x < x0 + w; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x + 17, y + 3); ctx.lineTo(x + 31, y + 17); ctx.lineTo(x + 17, y + 31); ctx.lineTo(x + 3, y + 17); ctx.closePath();
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 17, y + 17, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/** Small, dim white Tulunadu sun and half moon. */
export function sunMoon(ctx: Ctx, x: number, y: number) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(x + 7, y + 7, 6, 0, Math.PI * 2); ctx.fill();
  // Crescent: a disc with an offset disc cut away, drawn on a scratch canvas.
  const s = document.createElement('canvas');
  s.width = 40; s.height = 20;
  const c = s.getContext('2d')!;
  c.fillStyle = '#FFFFFF';
  c.beginPath(); c.arc(10, 10, 6, 0, Math.PI * 2); c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath(); c.arc(13, 8.2, 5.1, 0, Math.PI * 2); c.fill();
  ctx.drawImage(s, x + 20, y - 3);
  ctx.restore();
}

/** Lotus ornament (design viewBox 60×28), drawn at the given box. */
export function lotus(ctx: Ctx, x: number, y: number, w: number, color: string, base = true) {
  const k = w / 60;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  const paths = ['M30 2c5 6 5 14 0 20-5-6-5-14 0-20z', 'M30 22c-4-6-12-9-18-8 2 6 9 9 18 8z', 'M30 22c4-6 12-9 18-8-2 6-9 9-18 8z'];
  if (base) paths.push('M6 25h48');
  for (const d of paths) ctx.stroke(new Path2D(d));
  ctx.restore();
}

/** Gold rule – diamond – rule divider centred at cx. */
export function divider(ctx: Ctx, cx: number, y: number, width: number, color: string, gap = 14, size = 6) {
  ctx.save();
  ctx.fillStyle = color;
  const half = width / 2;
  const d = size * Math.SQRT2 / 2;
  ctx.fillRect(cx - half, y - 0.5, half - gap / 2 - d / 2 - 2, 1);
  ctx.fillRect(cx + gap / 2 + d / 2 + 2, y - 0.5, half - gap / 2 - d / 2 - 2, 1);
  ctx.translate(cx, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.restore();
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the temple photograph'));
    img.src = src;
  });
}

const SAMPLE = 'ಅಡ್ಕ ಶ್ರೀ ₹0123456789 ABCabc';
let fontsReady: Promise<unknown> | null = null;

/** Make sure every face used on receipts is loaded before drawing (canvas does not wait for fonts). */
export function ensureFonts() {
  fontsReady ??= Promise.all([
    ...[500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px "Noto Serif Kannada"`, SAMPLE)),
    ...[400, 500, 600, 700].map((w) => document.fonts.load(`${w} 20px "Noto Sans Kannada"`, SAMPLE)),
    ...[400, 600, 700, 800].map((w) => document.fonts.load(`${w} 20px "Manrope Variable"`, SAMPLE)),
  ]).catch(() => undefined);
  return fontsReady;
}
