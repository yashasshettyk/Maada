import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeftRight, ChevronLeft, Ellipsis, Flame, LayoutGrid, ReceiptText } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { isNative } from '../lib/native';
import { IconButton } from './ui';

const TABS = [
  { to: '/', label: 'nav.dashboard', Icon: LayoutGrid },
  { to: '/seves', label: 'nav.seves', Icon: Flame },
  { to: '/accounts', label: 'nav.transactions', Icon: ArrowLeftRight },
  { to: '/receipts', label: 'nav.receipts', Icon: ReceiptText },
  { to: '/more', label: 'nav.more', Icon: Ellipsis },
] as const;

export const TAB_ROOTS = TABS.map((t) => t.to as string);

export function BottomNav() {
  const { t } = useI18n();
  return (
    <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto grid max-w-2xl grid-cols-5 px-1.5 pt-1.5">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => clsx('flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl', isActive ? 'text-maroon' : 'text-ink-soft')}>
            {({ isActive }) => (
              <>
                <span className={clsx('flex h-8 w-14 items-center justify-center rounded-full transition-colors', isActive && 'bg-[#f3e4e2]')}>
                  <Icon className="size-[21px]" strokeWidth={isActive ? 2.2 : 1.9} aria-hidden />
                </span>
                <span className={clsx('max-w-full truncate px-0.5 text-[11px] leading-tight', isActive ? 'font-extrabold' : 'font-semibold')}>{t(label)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** A screen: compact top bar plus content. Tab screens show a large title; others show a back button. */
export function Page({ title, children, actions, back, large, className }: {
  title: string; children: ReactNode; actions?: ReactNode; back?: boolean | string; large?: boolean; className?: string;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  useEffect(() => { document.title = `${title} · Maada`; }, [title]);
  const goBack = () => {
    if (typeof back === 'string') navigate(back);
    else if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/');
  };
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="safe-top sticky top-0 z-20 bg-ivory/92 backdrop-blur">
        <div className={clsx('flex items-center gap-1', large ? 'min-h-16 px-5 pt-2' : 'min-h-14 px-2')}>
          {back && <IconButton label={t('common.back')} onClick={goBack}><ChevronLeft className="size-6 text-ink" /></IconButton>}
          <h1 className={clsx('min-w-0 flex-1 truncate', large ? 'text-[26px] font-extrabold tracking-tight' : 'text-[17px] font-extrabold', back && 'pl-0.5')}>{title}</h1>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </div>
      </header>
      <main className={clsx('flex flex-1 flex-col gap-5 px-4 pb-8 pt-2', className)}>{children}</main>
    </div>
  );
}

/** Android hardware back: go back in history, or leave the app from a tab root. */
export function useAndroidBack() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => void) | undefined;
    import('@capacitor/app').then(({ App }) => {
      App.addListener('backButton', () => {
        if (document.querySelector('[role="dialog"]')) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        } else if (TAB_ROOTS.includes(location.pathname)) {
          if (location.pathname === '/') App.exitApp(); else navigate('/');
        } else {
          navigate(-1);
        }
      }).then((h) => { remove = () => h.remove(); });
    });
    return () => remove?.();
  }, [navigate, location.pathname]);
}

export function FloatingAction({ to, onClick, label, icon, withNav }: { to?: string; onClick?: () => void; label: string; icon: ReactNode; withNav?: boolean }) {
  const navigate = useNavigate();
  return (
    <button onClick={onClick ?? (() => to && navigate(to))}
      className={clsx('fixed right-4 z-20', withNav ? 'bottom-[92px]' : 'bottom-[max(1.25rem,env(safe-area-inset-bottom))]', 'flex h-14 items-center gap-2 rounded-[18px] bg-maroon pl-4 pr-5 text-[15px] font-extrabold text-white shadow-float transition-colors hover:bg-burgundy sm:right-[max(1rem,calc(50%-20rem))]')}>
      {icon}{label}
    </button>
  );
}
