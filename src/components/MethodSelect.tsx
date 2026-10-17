import { useI18n } from '../lib/i18n';
import { METHODS, METHOD_VALUE } from '../lib/forms';
import { Select } from './ui';

export function MethodSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {METHODS.map((m) => <option key={m} value={METHOD_VALUE[m]}>{t(`method.${m}`)}</option>)}
    </Select>
  );
}

export function useMethodLabel() {
  const { t } = useI18n();
  return (v: string | null | undefined) => {
    const key = METHODS.find((m) => METHOD_VALUE[m] === v);
    return key ? t(`method.${key}`) : v ?? '';
  };
}
