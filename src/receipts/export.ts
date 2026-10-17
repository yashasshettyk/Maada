import type { Rendered } from './render';

export function toPngBlob(r: Rendered): Promise<Blob> {
  return new Promise((resolve, reject) => r.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png'));
}

/** A PDF with the receipt at its exact proportions (one page, no margins). */
export async function toPdfBlob(r: Rendered): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const wMm = r.width >= r.height ? 297 : 148;
  const hMm = (wMm * r.height) / r.width;
  const doc = new jsPDF({ orientation: r.width >= r.height ? 'landscape' : 'portrait', unit: 'mm', format: [wMm, hMm], compress: true });
  // White under the scalloped edge for print; JPEG keeps the file small while staying sharp at this resolution.
  const flat = document.createElement('canvas');
  flat.width = r.width;
  flat.height = r.height;
  const fctx = flat.getContext('2d')!;
  fctx.fillStyle = '#FFFFFF';
  fctx.fillRect(0, 0, flat.width, flat.height);
  fctx.drawImage(r.canvas, 0, 0);
  doc.addImage(flat.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, wMm, hMm, undefined, 'FAST');
  return doc.output('blob');
}

export function fileBase(number: string) {
  // Receipt numbers may contain Kannada letters; keep them but drop characters that are unsafe in file names.
  return `receipt-${number.replace(/[\\/:*?"<>|\s]+/g, '-')}`;
}
