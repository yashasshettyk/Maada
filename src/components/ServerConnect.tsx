import { useState } from 'react';
import { getServer, setServer, testServer } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Button, Field, TextInput } from './ui';

/** Server address + access key form, used on first launch and from Settings. */
export function ServerForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const current = getServer();
  const [url, setUrl] = useState(current.url);
  const [key, setKey] = useState(current.key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await testServer({ url, key });
      setServer({ url, key });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); connect(); }}>
      <Field label={t('srv.url')} htmlFor="srv-url">
        <TextInput id="srv-url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={url}
          onChange={(e) => setUrl(e.target.value)} placeholder={t('srv.urlPlaceholder')} />
      </Field>
      <Field label={t('srv.key')} htmlFor="srv-key" hint={t('srv.keyHint')} error={error}>
        <TextInput id="srv-key" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" block loading={busy} disabled={!url.trim()}>{t('srv.connect')}</Button>
    </form>
  );
}

export function ServerSetupScreen({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  return (
    <div className="safe-top mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 pb-10 pt-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-24 items-end justify-center overflow-hidden rounded-[28px] bg-oxblood shadow-[0_12px_30px_rgb(58_16_19/0.3)]">
          <img src={`${import.meta.env.BASE_URL}branding/maada-temple.webp`} alt="" className="w-[88px]" />
        </span>
        <div className="font-[family-name:var(--font-serif-kn)] text-2xl font-bold text-maroon">ಅಡ್ಕ ಶ್ರೀ ಬೀರಮಾರ್ಲರ ಮಾಡ</div>
        <h1 className="text-xl font-extrabold">{t('srv.title')}</h1>
        <p className="text-sm leading-relaxed text-muted">{t('srv.hint')}</p>
      </div>
      <ServerForm onDone={onDone} />
    </div>
  );
}
