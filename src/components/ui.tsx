import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronRight, CircleAlert, CircleCheck, LoaderCircle, X } from 'lucide-react';
import { formatINR, paiseToInput, parseRupeesToPaise } from '../../shared/money';
import { useI18n } from '../lib/i18n';

// ---------- Buttons ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-maroon text-white hover:bg-burgundy active:bg-maroon-deep shadow-[0_6px_16px_rgb(100_30_43/0.18)]',
  secondary: 'bg-paper text-maroon border border-[#dccbb0] hover:bg-sand',
  ghost: 'bg-transparent text-maroon hover:bg-sand',
  danger: 'bg-transparent text-expense hover:bg-expense-bg',
  gold: 'bg-gold-light/30 text-maroon-deep border border-gold/40 hover:bg-gold-light/50',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: 'md' | 'lg' | 'sm'; loading?: boolean; icon?: ReactNode; block?: boolean;
}>(function Button({ variant = 'primary', size = 'md', loading, icon, block, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 rounded-2xl font-bold transition-colors disabled:opacity-55 disabled:pointer-events-none',
        size === 'lg' && 'h-14 px-6 text-base',
        size === 'md' && 'h-12 px-5 text-[15px]',
        size === 'sm' && 'h-10 px-3.5 text-sm rounded-xl',
        block && 'w-full',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label}
      className={clsx('inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-soft transition-colors hover:bg-sand active:bg-beige', className)}
      {...rest}>
      {children}
    </button>
  );
}

// ---------- Surfaces ----------
export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' }) {
  return <As className={clsx('rounded-[20px] bg-paper shadow-card', className)}>{children}</As>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-1">
      <h2 className="text-[15px] font-extrabold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="px-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted">{children}</div>;
}

// ---------- Money ----------
export function Money({ paise, sign, tone, className }: { paise: number; sign?: boolean; tone?: 'income' | 'expense' | 'pending' | 'ink'; className?: string }) {
  const prefix = sign ? (tone === 'expense' ? '−' : '+') : '';
  return (
    <span className={clsx('tabular whitespace-nowrap', tone === 'income' && 'text-income', tone === 'expense' && 'text-expense', tone === 'pending' && 'text-pending', className)}>
      {prefix}{formatINR(Math.abs(paise))}
    </span>
  );
}

// ---------- Badges ----------
export function Badge({ tone = 'neutral', children }: { tone?: 'income' | 'expense' | 'pending' | 'seal' | 'neutral' | 'maroon'; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex h-6 shrink-0 items-center rounded-lg px-2 text-xs font-bold',
      tone === 'income' && 'bg-income-bg text-[#1d6646]',
      tone === 'expense' && 'bg-expense-bg text-[#9c3434]',
      tone === 'pending' && 'bg-pending-bg text-[#6e4a10]',
      tone === 'seal' && 'bg-seal-bg text-seal',
      tone === 'maroon' && 'bg-[#f3e4e2] text-maroon',
      tone === 'neutral' && 'bg-beige text-ink-soft')}>
      {children}
    </span>
  );
}

export function SeveStatus({ status }: { status: 'pending' | 'partial' | 'paid' | 'overpaid' }) {
  const { t } = useI18n();
  const tone = { pending: 'expense', partial: 'pending', paid: 'income', overpaid: 'seal' } as const;
  return <Badge tone={tone[status]}>{t(`seve.status.${status}`)}</Badge>;
}

// ---------- Chips & segmented ----------
export function Chips<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={clsx('h-9 shrink-0 rounded-full px-3.5 text-[13px] transition-colors',
            o.value === value ? 'bg-ink font-bold text-white' : 'bg-beige font-semibold text-[#3d3936] hover:bg-[#e7dcc8]')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-[#f3eee4] p-[3px]">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={clsx('h-8 min-w-11 rounded-[9px] px-2.5 text-xs transition-colors',
            o.value === value ? 'bg-paper font-bold text-ink shadow-[0_1px_2px_rgb(41_39_37/0.12)]' : 'font-semibold text-ink-soft')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Form fields ----------
export function Field({ label, hint, error, optional, children, htmlFor }: {
  label: string; hint?: string; error?: string | null; optional?: boolean; children: ReactNode; htmlFor?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="px-0.5 text-[13px] font-bold text-ink-soft">
        {label}{optional && <span className="font-medium text-muted"> ({t('common.optional')})</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 px-0.5 text-[13px] font-semibold text-expense"><CircleAlert className="size-4" aria-hidden />{error}</p>
      ) : hint ? <p className="px-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const inputBase = 'w-full min-w-0 rounded-2xl border-[1.5px] bg-paper px-4 text-[16px] text-ink outline-none transition-colors placeholder:text-[#a39d96] focus:border-maroon';

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className, invalid, ...rest }, ref) {
    return <input ref={ref} className={clsx(inputBase, 'h-13 font-semibold', invalid ? 'border-expense' : 'border-[#e2d7c3]', className)} {...rest} />;
  });

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} className={clsx(inputBase, 'resize-none border-[#e2d7c3] py-3 font-medium', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(inputBase, 'h-13 appearance-none border-[#e2d7c3] bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22%236b6763%22%20stroke-width%3D%222%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[position:right_14px_center] bg-no-repeat pr-10 font-semibold', className)} {...rest}>
      {children}
    </select>
  );
}

/** Rupee amount input that keeps the raw text and reports exact paise (or null when invalid/empty). */
export function AmountInput({ id, value, onChange, invalid, large, autoFocus, placeholder = '0' }: {
  id?: string; value: string; onChange: (text: string, paise: number | null) => void; invalid?: boolean; large?: boolean; autoFocus?: boolean; placeholder?: string;
}) {
  if (large) {
    return (
      <div className={clsx('flex max-w-full items-baseline justify-center gap-1 border-b-2 px-3 pb-1', invalid ? 'border-expense' : 'border-[#e2d7c3] focus-within:border-maroon')}>
        <span className="text-3xl font-bold text-muted">₹</span>
        <input id={id} inputMode="decimal" autoComplete="off" autoFocus={autoFocus} value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value, parseRupeesToPaise(e.target.value))}
          style={{ width: `${Math.min(Math.max((value || placeholder).length, 1) + 0.4, 12)}ch` }}
          className={clsx('tabular min-w-[1.4ch] max-w-[78vw] border-0 bg-transparent text-left text-[44px] font-extrabold tracking-tight text-ink outline-none placeholder:text-[#cfc6b8]', invalid && 'text-expense')} />
      </div>
    );
  }
  return (
    <div className={clsx('flex h-13 items-center gap-2 rounded-2xl border-[1.5px] bg-paper px-4 focus-within:border-maroon', invalid ? 'border-expense' : 'border-[#e2d7c3]')}>
      <span className="text-lg font-bold text-muted">₹</span>
      <input id={id} inputMode="decimal" autoComplete="off" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value, parseRupeesToPaise(e.target.value))}
        className="tabular w-full min-w-0 border-0 bg-transparent text-[17px] font-bold text-ink outline-none placeholder:text-[#b9b1a5]" />
    </div>
  );
}

export function useAmount(initial?: number | null) {
  const [text, setText] = useState(initial != null ? paiseToInput(initial) : '');
  const [paise, setPaise] = useState<number | null>(initial ?? null);
  const set = useCallback((t: string, p: number | null) => { setText(t); setPaise(p); }, []);
  const reset = useCallback((p: number | null) => { setText(p != null ? paiseToInput(p) : ''); setPaise(p); }, []);
  return { text, paise, set, reset };
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-14 cursor-pointer items-center gap-3.5 px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-[#d9cfbf] transition-colors peer-checked:bg-maroon peer-focus-visible:outline-2 peer-focus-visible:outline-maroon after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}

// ---------- Lists ----------
export function ListRow({ to, onClick, icon, title, subtitle, trailing, chevron, className }: {
  to?: string; onClick?: () => void; icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; chevron?: boolean; className?: string;
}) {
  const inner = (
    <>
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-bold text-ink">{title}</span>
        {subtitle && <span className="truncate text-xs text-muted">{subtitle}</span>}
      </span>
      {trailing}
      {chevron && <ChevronRight className="size-[18px] shrink-0 text-[#a39d96]" aria-hidden />}
    </>
  );
  const cls = clsx('flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors', (to || onClick) && 'hover:bg-[#fbf6ec] active:bg-sand', className);
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={clsx('divide-y divide-[#f1ebdf] overflow-hidden', className)} as="div">{children}</Card>;
}

export function IconTile({ tone, children }: { tone: 'income' | 'expense' | 'maroon' | 'gold' | 'neutral' | 'seal'; children: ReactNode }) {
  return (
    <span aria-hidden className={clsx('flex size-10 shrink-0 items-center justify-center rounded-xl',
      tone === 'income' && 'bg-income-bg text-income', tone === 'expense' && 'bg-expense-bg text-expense',
      tone === 'maroon' && 'bg-[#f3e4e2] text-maroon', tone === 'gold' && 'bg-sand text-gold-ink',
      tone === 'neutral' && 'bg-beige text-ink-soft', tone === 'seal' && 'bg-seal-bg text-seal')}>
      {children}
    </span>
  );
}

// ---------- States ----------
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-[#ddd0b8] bg-paper/60 px-6 py-10 text-center">
      {icon && <span className="flex size-14 items-center justify-center rounded-2xl bg-sand text-gold-ink">{icon}</span>}
      <p className="text-[15px] font-bold">{title}</p>
      {hint && <p className="max-w-xs text-sm leading-relaxed text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx('skeleton rounded-xl', className)} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Card as="div" className="divide-y divide-[#f1ebdf]">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <Skeleton className="size-10" />
          <div className="flex flex-1 flex-col gap-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </Card>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-[20px] bg-expense-bg/50 px-6 py-8 text-center">
      <CircleAlert className="size-7 text-expense" aria-hidden />
      <p className="text-sm font-semibold text-[#7a2c2c]">{(error as Error)?.message || t('common.loadError')}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{t('common.retry')}</Button>}
    </div>
  );
}

// ---------- Sheet / dialog ----------
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label={title} tabIndex={-1} className="absolute inset-0 bg-[#1d0a0d]/45" onClick={onClose} />
      <div ref={ref} className="animate-sheet safe-bottom relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-ivory px-5 pb-5 pt-3 sm:rounded-[28px]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#d9cfbf] sm:hidden" aria-hidden />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <IconButton label="Close" onClick={onClose}><X className="size-5" /></IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose, danger = true, loading }: {
  open: boolean; title: string; message?: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; danger?: boolean; loading?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {message && <p className="mb-5 text-[15px] leading-relaxed text-ink-soft">{message}</p>}
      <div className="flex gap-3">
        <Button variant="secondary" block onClick={onClose}>{t('common.cancel')}</Button>
        <Button block onClick={onConfirm} loading={loading} className={danger ? '!bg-expense hover:!bg-[#9c3434]' : undefined}>{confirmLabel}</Button>
      </div>
    </Sheet>
  );
}

// ---------- Toasts ----------
interface Toast { id: number; message: string; tone: 'ok' | 'error' }
const ToastCtx = createContext<(message: string, tone?: 'ok' | 'error') => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), tone === 'error' ? 5000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((x) => (
          <div key={x.id} className={clsx('animate-toast pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-lg',
            x.tone === 'ok' ? 'bg-ink' : 'bg-expense')}>
            {x.tone === 'ok' ? <CircleCheck className="size-5 shrink-0 text-gold-light" aria-hidden /> : <CircleAlert className="size-5 shrink-0" aria-hidden />}
            {x.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------- Detail rows ----------
export function DetailList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <Card as="div" className="divide-y divide-[#f1ebdf]">
      {rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== '').map((r) => (
        <div key={r.label} className="flex items-start justify-between gap-4 px-4 py-3.5 text-[14px]">
          <span className="shrink-0 text-muted">{r.label}</span>
          <span className="min-w-0 text-right font-semibold [overflow-wrap:anywhere]">{r.value}</span>
        </div>
      ))}
    </Card>
  );
}
