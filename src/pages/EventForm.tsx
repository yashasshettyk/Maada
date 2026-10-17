import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, newId, post, put } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useSave } from '../lib/forms';
import { todayIST } from '../../shared/dates';
import { Button, Field, Skeleton, TextArea, TextInput } from '../components/ui';
import { Page } from '../components/Shell';

export default function EventForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { t } = useI18n();
  const existing = useQuery({ queryKey: ['event', id], queryFn: () => get(`/events/${id}`), enabled: editing });
  const [eventId] = useState(newId);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayIST());
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    const e = existing.data?.item;
    if (e) { setName(e.name); setDate(e.event_date); setDescription(e.description ?? ''); setNotes(e.notes ?? ''); }
  }, [existing.data]);
  const save = useSave(() => {
    const body = { name, event_date: date, description, notes };
    return editing ? put(`/events/${id}`, body) : post('/events', { ...body, id: eventId });
  }, { success: t('common.saved'), to: (r: any) => `/events/${r.item.id}` });
  if (editing && existing.isLoading) return <Page title={t('ev.edit')} back><Skeleton className="h-48 w-full" /></Page>;
  return (
    <Page title={editing ? t('ev.edit') : t('ev.new')} back>
      <form noValidate onSubmit={(e) => { e.preventDefault(); setTouched(true); if (name.trim() && date) save.mutate(undefined); }} className="flex flex-col gap-5">
        <Field label={t('ev.name')} htmlFor="e-name" hint={t('common.typeKnOrEn')} error={touched && !name.trim() ? `${t('ev.name')}?` : null}>
          <TextInput id="e-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('ev.namePlaceholder')} autoFocus={!editing} invalid={touched && !name.trim()} />
        </Field>
        <Field label={t('ev.date')} htmlFor="e-date"><TextInput id="e-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t('common.description')} htmlFor="e-desc" optional><TextArea id="e-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label={t('common.notes')} htmlFor="e-notes" optional><TextArea id="e-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('common.notesPlaceholder')} /></Field>
        <Button type="submit" size="lg" block loading={save.isPending}>{t('common.save')}</Button>
      </form>
    </Page>
  );
}
