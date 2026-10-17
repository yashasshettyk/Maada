import { useI18n } from '../lib/i18n';
import type { Ritual } from '../lib/data';
import { Select } from './ui';

export function RitualSelect({ id, rituals, value, onChange }: { id: string; rituals: Ritual[]; value: string; onChange: (r: Ritual | undefined) => void }) {
  const { t } = useI18n();
  return (
    <Select id={id} value={value} onChange={(e) => onChange(rituals.find((r) => r.id === e.target.value))}>
      <option value="" disabled>{t('seve.chooseType')}</option>
      {rituals.map((r) => <option key={r.id} value={r.id}>{r.receipt_title ? `${r.name} · ${r.receipt_title}` : r.name}</option>)}
    </Select>
  );
}
