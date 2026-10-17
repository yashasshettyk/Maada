import { Capacitor, registerPlugin } from '@capacitor/core';

/** Saving and sharing files: native share sheet on Android, downloads / Web Share on the web. */

export const isNative = () => Capacitor.isNativePlatform();

interface WhatsAppSharePlugin {
  isAvailable(): Promise<{ available: boolean }>;
  share(opts: { url: string; text?: string }): Promise<void>;
}
const WhatsAppShare = registerPlugin<WhatsAppSharePlugin>('WhatsAppShare');

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function writeCache(blob: Blob, filename: string) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const res = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache, recursive: true });
  return res.uri;
}

/** Save a file where the user can find it. Returns a short description of the location. */
export async function saveFile(blob: Blob, filename: string): Promise<string> {
  if (!isNative()) {
    downloadBlob(blob, filename);
    return 'Downloads';
  }
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  await Filesystem.writeFile({
    path: `Maada/${filename}`, data: await blobToBase64(blob), directory: Directory.Documents, recursive: true,
  });
  return 'Documents/Maada';
}

/** Open the system share sheet. Returns false if sharing is unavailable and the file was downloaded instead. */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<boolean> {
  if (isNative()) {
    const { Share } = await import('@capacitor/share');
    const uri = await writeCache(blob, filename);
    await Share.share({ title, files: [uri], dialogTitle: title });
    return true;
  }
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e;
    }
    return true;
  }
  downloadBlob(blob, filename);
  return false;
}

/** Share straight to WhatsApp when it is installed; otherwise fall back to the share sheet. Returns 'whatsapp' | 'sheet' | 'download'. */
export async function shareToWhatsApp(blob: Blob, filename: string, title: string): Promise<'whatsapp' | 'sheet' | 'download'> {
  if (isNative()) {
    try {
      const { available } = await WhatsAppShare.isAvailable();
      if (available) {
        await WhatsAppShare.share({ url: await writeCache(blob, filename), text: title });
        return 'whatsapp';
      }
    } catch { /* plugin unavailable: use the share sheet */ }
  }
  return (await shareFile(blob, filename, title)) ? 'sheet' : 'download';
}

export function downloadText(text: string, filename: string, type = 'text/csv') {
  return saveFile(new Blob([text], { type: `${type};charset=utf-8` }), filename);
}
