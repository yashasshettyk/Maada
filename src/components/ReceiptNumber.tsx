import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { Button, Field, Sheet, TextInput } from './ui';

/** Receipt number typed in from the physical receipt book. */
export function ReceiptNumberField({ id, value, onChange, touched, hint }: { id: string; value: string; onChange: (v: string) => void; touched?: boolean; hint?: string }) {
  const { t } = useI18n();
  const missing = touched && !value.trim();
  return (
    <Field label={t('rcpt.number')} htmlFor={id} hint={hint} error={missing ? t('rcpt.numberRequired') : null}>
      <TextInput id={id} value={value} maxLength={40} autoComplete="off" onChange={(e) => onChange(e.target.value)} placeholder={t('rcpt.numberPlaceholder')} invalid={missing} />
    </Field>
  );
}

/** Asks for the receipt number before a receipt or bill is created. */
export function ReceiptNumberSheet({ open, onClose, onSubmit, loading, initial = '', title, hint }: {
  open: boolean; onClose: () => void; onSubmit: (number: string) => void; loading?: boolean; initial?: string; title?: string; hint?: string;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setValue(initial); setTouched(false); } }, [open, initial]);
  return (
    <Sheet open={open} onClose={onClose} title={title ?? t('rcpt.create')}>
      <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (value.trim()) onSubmit(value.trim()); }}>
        <ReceiptNumberField id="rn-sheet" value={value} onChange={setValue} touched={touched} hint={hint} />
        <Button type="submit" size="lg" block loading={loading}>{title ?? t('rcpt.create')}</Button>
      </form>
    </Sheet>
  );
}
