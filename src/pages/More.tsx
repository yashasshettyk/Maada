import { BarChart3, CalendarDays, Coins, HandHeart, Languages, Receipt, ReceiptText, Settings2, Wallet } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { Eyebrow, IconTile, List, ListRow, Segmented } from '../components/ui';
import { Page } from '../components/Shell';

export default function More() {
  const { t, lang, setLang } = useI18n();
  return (
    <Page title={t('more.title')} large>
      <section className="flex flex-col gap-2">
        <Eyebrow>{t('more.records')}</Eyebrow>
        <List>
          <ListRow to="/donations" chevron icon={<IconTile tone="maroon"><HandHeart className="size-[19px]" /></IconTile>} title={t('don.title')} subtitle={t('more.donationsHint')} />
          <ListRow to="/events" chevron icon={<IconTile tone="gold"><CalendarDays className="size-[19px]" /></IconTile>} title={t('ev.title')} subtitle={t('more.eventsHint')} />
          <ListRow to="/expenses" chevron icon={<IconTile tone="expense"><Receipt className="size-[19px]" /></IconTile>} title={t('exp.title')} subtitle={t('more.expensesHint')} />
          <ListRow to="/income/new" chevron icon={<IconTile tone="income"><Coins className="size-[19px]" /></IconTile>} title={t('inc.new')} subtitle={t('more.incomeHint')} />
        </List>
      </section>
      <section className="flex flex-col gap-2">
        <Eyebrow>{t('more.setup')}</Eyebrow>
        <List>
          <ListRow to="/reports" chevron icon={<IconTile tone="neutral"><BarChart3 className="size-[19px]" /></IconTile>} title={t('rep.title')} subtitle={t('more.reportsHint')} />
          <ListRow to="/settings#opening" chevron icon={<IconTile tone="neutral"><Wallet className="size-[19px]" /></IconTile>} title={t('set.opening')} subtitle={t('more.openingHint')} />
          <ListRow to="/settings#receipt" chevron icon={<IconTile tone="neutral"><ReceiptText className="size-[19px]" /></IconTile>} title={t('set.receiptText')} subtitle={t('more.receiptHint')} />
          <ListRow to="/settings" chevron icon={<IconTile tone="neutral"><Settings2 className="size-[19px]" /></IconTile>} title={t('set.title')} subtitle={t('more.settingsHint')} />
          <div className="flex min-h-[64px] items-center gap-3 px-4 py-3">
            <IconTile tone="neutral"><Languages className="size-[19px]" /></IconTile>
            <span className="flex-1 text-[15px] font-bold">{t('more.language')}</span>
            <Segmented label={t('more.language')} value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'kn', label: 'ಕನ್ನಡ' }]} />
          </div>
        </List>
      </section>
    </Page>
  );
}
