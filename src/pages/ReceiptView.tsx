import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Ban, Download, FileDown, LoaderCircle, MessageCircle, RefreshCw, Share2, Trash2, X } from 'lucide-react';
import { del, get, post } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSave } from '../lib/forms';
import { useSettings } from '../lib/data';
import { formatTimestamp } from '../../shared/dates';
import { renderReceipt, type Rendered, type ReceiptRecord } from '../receipts/render';
import { fileBase, toPdfBlob, toPngBlob } from '../receipts/export';
import { saveFile, shareFile, shareToWhatsApp } from '../lib/native';
import { Badge, Button, ConfirmDialog, DetailList, ErrorState, Field, Sheet, Skeleton, TextArea, useToast } from '../components/ui';
import { ReceiptNumberSheet } from '../components/ReceiptNumber';
import { Page } from '../components/Shell';

export default function ReceiptView() {
  const { id } = useParams();
  const { t } = useI18n();
  const toast = useToast();
  const settings = useSettings();
  const q = useQuery({ queryKey: ['receipt', id], queryFn: () => get<{ item: ReceiptRecord & { id: string; created_at: string; cancel_reason: string | null }; related: any[]; link: string | null; replaces: string | null }>(`/receipts/${id}`) });
  const r = q.data?.item;
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reissueOpen, setReissueOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!r) return;
    let url: string | null = null;
    let cancelled = false;
    setRendered(null);
    // Let the page paint first, then draw the high-resolution receipt.
    const timer = setTimeout(() => {
      renderReceipt(r, settings.data?.settings.date_format)
        .then(async (out) => {
          if (cancelled) return;
          setRendered(out);
          url = URL.createObjectURL(await toPngBlob(out));
          setPreview(url);
        })
        .catch((e) => setRenderError(e.message));
    }, 30);
    return () => { cancelled = true; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [r, settings.data?.settings.date_format]);

  const cancel = useSave(() => post(`/receipts/${id}/cancel`, { reason }), {
    success: t('rcpt.cancelled'), onDone: () => { setCancelOpen(false); q.refetch(); },
  });
  const reissue = useSave((number: string) => post(`/receipts/${id}/reissue`, { receipt_number: number }), { to: (res: any) => `/receipts/${res.item.id}`, onDone: () => setReissueOpen(false) });
  const remove = useSave(() => del(`/receipts/${id}`), { success: t('common.deleted'), onDone: () => { setDeleteOpen(false); navigate('/receipts', { replace: true }); } });

  const run = async (kind: 'share' | 'whatsapp' | 'png' | 'pdf') => {
    if (!rendered || !r) return;
    setBusy(kind);
    try {
      const base = fileBase(r.receipt_number);
      const title = `${r.snapshot_data.title_kn ?? ''} ${r.receipt_number}`.trim();
      if (kind === 'pdf') {
        const where = await saveFile(await toPdfBlob(rendered), `${base}.pdf`);
        toast(t('rcpt.savedTo', { place: where }));
      } else {
        const png = await toPngBlob(rendered);
        if (kind === 'png') toast(t('rcpt.savedTo', { place: await saveFile(png, `${base}.png`) }));
        else if (kind === 'share') { if (!(await shareFile(png, `${base}.png`, title))) toast(t('rcpt.shareUnavailable')); }
        else {
          const how = await shareToWhatsApp(png, `${base}.png`, title);
          if (how === 'download') toast(t('rcpt.shareUnavailable'));
        }
      }
    } catch (e) {
      toast((e as Error).message || 'Could not complete this action', 'error');
    } finally {
      setBusy(null);
    }
  };

  const typeLabel = r ? t(`rcpt.type.${r.receipt_type}`) : '';
  const isBill = r?.receipt_type === 'expense_bill';
  return (
    <Page title={r ? (isBill ? t('ev.bill') : `${typeLabel} · ${t('tx.receipt')}`) : t('tx.receipt')} back
      actions={r && <Badge tone={r.status === 'issued' ? 'income' : 'expense'}>{r.status === 'issued' ? t('rcpt.issued') : t('rcpt.cancelled')}</Badge>}>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !r ? <Skeleton className="aspect-[3/2] w-full" /> : (
        <>
          <p className="-mt-2 px-1 text-sm font-semibold text-muted">{r.receipt_number}</p>
          {r.status === 'cancelled' && (
            <div role="status" className="rounded-2xl bg-expense-bg px-4 py-3 text-sm font-semibold text-[#7a2c2c]">{t('rcpt.cancelledBanner', { reason: r.cancel_reason ?? '' })}</div>
          )}
          <button type="button" onClick={() => preview && setFull(true)} aria-label={t('rcpt.tapFull')}
            className={`relative w-full overflow-hidden rounded-2xl bg-paper shadow-[0_8px_28px_rgb(41_39_37/0.14)] ${isBill ? 'mx-auto max-w-sm' : ''}`}>
            {preview ? (
              <img src={preview} alt={`${typeLabel} ${r.receipt_number}`} className="block w-full" />
            ) : (
              <div className={`flex w-full flex-col items-center justify-center gap-3 ${isBill ? 'aspect-[2/3]' : 'aspect-[3/2]'}`}>
                {renderError ? <span className="px-6 text-sm text-expense">{renderError}</span> : <><LoaderCircle className="size-7 animate-spin text-maroon" /><span className="text-sm text-muted">{t('rcpt.preparing')}</span></>}
              </div>
            )}
          </button>
          {rendered && <p className="-mt-2 text-center text-xs text-muted">{t('rcpt.tapFull')} · {t('rcpt.printReady', { w: rendered.width, h: rendered.height })}</p>}

          <Button size="lg" block icon={<Share2 className="size-5" />} disabled={!rendered} loading={busy === 'share'} onClick={() => run('share')}>{t('rcpt.share')}</Button>
          <div className="grid grid-cols-3 gap-2.5">
            {([
              ['whatsapp', t('rcpt.whatsapp'), <MessageCircle key="w" className="size-[22px] text-income" />],
              ['png', t('rcpt.savePng'), <Download key="p" className="size-[22px] text-maroon" />],
              ['pdf', t('rcpt.savePdf'), <FileDown key="d" className="size-[22px] text-maroon" />],
            ] as const).map(([kind, label, icon]) => (
              <button key={kind} type="button" disabled={!rendered || !!busy} onClick={() => run(kind)}
                className="flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl bg-paper text-[13px] font-bold shadow-card transition-colors hover:bg-sand disabled:opacity-50">
                {busy === kind ? <LoaderCircle className="size-[22px] animate-spin text-maroon" /> : icon}{label}
              </button>
            ))}
          </div>

          <DetailList rows={[
            { label: t('rcpt.linked'), value: q.data?.link ? <Link to={q.data.link} className="font-bold text-maroon underline-offset-4 hover:underline">{r.snapshot_data.name ?? r.snapshot_data.event_name}</Link> : r.snapshot_data.name ?? r.snapshot_data.event_name },
            { label: t('rcpt.issuedOn'), value: formatTimestamp(r.created_at) },
            { label: t('common.history'), value: q.data?.replaces ? t('rcpt.replaces', { number: q.data.replaces }) : t('rcpt.historyNone') },
          ]} />
          {(q.data?.related?.length ?? 0) > 0 && (
            <DetailList rows={q.data!.related.map((x) => ({
              label: x.receipt_number,
              value: <Link to={`/receipts/${x.id}`} className="text-maroon">{x.status === 'issued' ? t('rcpt.issued') : `${t('rcpt.cancelled')}${x.cancel_reason ? ` · ${x.cancel_reason}` : ''}`}</Link>,
            }))} />
          )}

          {r.status === 'issued' ? (
            !isBill && <Button variant="danger" icon={<Ban className="size-5" />} onClick={() => setCancelOpen(true)}>{t('rcpt.cancel')}…</Button>
          ) : q.data?.link && !q.data.related.some((x) => x.status === 'issued') ? (
            <Button variant="secondary" icon={<RefreshCw className="size-5" />} onClick={() => setReissueOpen(true)}>{t('rcpt.reissue')}</Button>
          ) : null}
          <Button variant="ghost" icon={<Trash2 className="size-5 text-expense" />} className="text-expense" onClick={() => setDeleteOpen(true)}>{t('rcpt.delete')}…</Button>
        </>
      )}

      <Sheet open={cancelOpen} onClose={() => setCancelOpen(false)} title={t('rcpt.cancel')}>
        <p className="mb-4 text-sm leading-relaxed text-ink-soft">{t('rcpt.cancelHint')}</p>
        <Field label={t('rcpt.cancelReason')} htmlFor="cr">
          <TextArea id="cr" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('rcpt.cancelReasonPlaceholder')} />
        </Field>
        <div className="mt-5 flex gap-3">
          <Button variant="secondary" block onClick={() => setCancelOpen(false)}>{t('common.back')}</Button>
          <Button block disabled={!reason.trim()} loading={cancel.isPending} className="!bg-expense" onClick={() => cancel.mutate(undefined)}>{t('rcpt.cancel')}</Button>
        </div>
      </Sheet>

      <ReceiptNumberSheet open={reissueOpen} onClose={() => setReissueOpen(false)} title={t('rcpt.reissue')} hint={t('rcpt.numberKeepHint')} initial={r?.receipt_number ?? ''} loading={reissue.isPending} onSubmit={(number) => reissue.mutate(number)} />
      <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('rcpt.delete')} message={t('rcpt.deleteHint')} confirmLabel={t('common.delete')} loading={remove.isPending} onConfirm={() => remove.mutate(undefined)} />

      {full && preview && (
        <div role="dialog" aria-modal="true" aria-label={t('tx.receipt')} className="fixed inset-0 z-50 flex flex-col bg-[#140708]">
          <div className="safe-top flex justify-end p-2">
            <button aria-label={t('common.close')} onClick={() => setFull(false)} className="flex size-12 items-center justify-center rounded-full text-white hover:bg-white/10"><X className="size-6" /></button>
          </div>
          <div className="flex-1 overflow-auto" style={{ touchAction: 'pan-x pan-y pinch-zoom' }}>
            <img src={preview} alt="" className={isBill ? 'mx-auto w-full max-w-xl' : 'h-full max-h-none w-auto max-w-none landscape:h-full portrait:w-[180%]'} />
          </div>
        </div>
      )}
    </Page>
  );
}
