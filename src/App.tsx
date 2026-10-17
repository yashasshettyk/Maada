import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider, useI18n } from './lib/i18n';
import { ToastProvider, Skeleton } from './components/ui';
import { BottomNav, TAB_ROOTS, useAndroidBack } from './components/Shell';
import { ApiError, getServer } from './lib/api';
import { isNative } from './lib/native';
import { ServerSetupScreen } from './components/ServerConnect';
import { useSettings } from './lib/data';
import { Dashboard } from './pages/Dashboard';

const Seves = lazy(() => import('./pages/Seves'));
const SeveEntry = lazy(() => import('./pages/SeveEntry'));
const SeveForm = lazy(() => import('./pages/SeveForm'));
const SeveQuick = lazy(() => import('./pages/SeveQuick'));
const Accounts = lazy(() => import('./pages/Accounts'));
const AccountEntry = lazy(() => import('./pages/AccountEntry'));
const Receipts = lazy(() => import('./pages/Receipts'));
const ReceiptView = lazy(() => import('./pages/ReceiptView'));
const More = lazy(() => import('./pages/More'));
const Donations = lazy(() => import('./pages/Donations'));
const DonationForm = lazy(() => import('./pages/DonationForm'));
const DonationDetail = lazy(() => import('./pages/DonationDetail'));
const Events = lazy(() => import('./pages/Events'));
const EventForm = lazy(() => import('./pages/EventForm'));
const EventDetail = lazy(() => import('./pages/EventDetail'));
const Expenses = lazy(() => import('./pages/Expenses'));
const ExpenseForm = lazy(() => import('./pages/ExpenseForm'));
const IncomeForm = lazy(() => import('./pages/IncomeForm'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-20">
      <Skeleton className="h-28 w-full rounded-3xl" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function OfflineBanner() {
  const { t } = useI18n();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) return null;
  return <div role="status" className="safe-top sticky top-0 z-40 bg-pending px-4 py-2 text-center text-[13px] font-semibold text-white">{t('common.offline')}</div>;
}

function Routed() {
  useAndroidBack();
  const location = useLocation();
  const showNav = TAB_ROOTS.includes(location.pathname);
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return (
    <>
      <OfflineBanner />
      <div className={showNav ? 'pb-[84px]' : ''}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/seves" element={<Seves />} />
            <Route path="/seves/new" element={<SeveForm />} />
            <Route path="/seves/receipt" element={<SeveQuick />} />
            <Route path="/seves/:id" element={<SeveEntry />} />
            <Route path="/seves/:id/edit" element={<SeveForm />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/accounts/:id" element={<AccountEntry />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/receipts/:id" element={<ReceiptView />} />
            <Route path="/more" element={<More />} />
            <Route path="/donations" element={<Donations />} />
            <Route path="/donations/new" element={<DonationForm />} />
            <Route path="/donations/:id" element={<DonationDetail />} />
            <Route path="/donations/:id/edit" element={<DonationForm />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/new" element={<EventForm />} />
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/events/:id/edit" element={<EventForm />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/expenses/new" element={<ExpenseForm />} />
            <Route path="/expenses/:id/edit" element={<ExpenseForm />} />
            <Route path="/income/new" element={<IncomeForm />} />
            <Route path="/income/:id/edit" element={<IncomeForm />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
      {showNav && <BottomNav />}
    </>
  );
}

function WithSettings() {
  // The Android app needs a server address; the web app uses its own origin.
  const [configured, setConfigured] = useState(() => !isNative() || Boolean(getServer().url));
  if (!configured) {
    return (
      <I18nProvider>
        <ServerSetupScreen onDone={() => { queryClient.clear(); setConfigured(true); }} />
      </I18nProvider>
    );
  }
  return <Configured />;
}

function Configured() {
  const settings = useSettings();
  return (
    <I18nProvider dateFormat={settings.data?.settings.date_format}>
      <ToastProvider>
        <BrowserRouter>
          <Routed />
        </BrowserRouter>
      </ToastProvider>
    </I18nProvider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WithSettings />
    </QueryClientProvider>
  );
}
