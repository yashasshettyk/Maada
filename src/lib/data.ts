import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get } from './api';

export interface Settings {
  institution_name: string; institution_name_kn: string; donation_title_kn: string; bill_title_kn: string;
  donation_ack_kn: string; seve_ack_kn: string; receipt_footer_kn: string;
  donation_prefix: string; seve_prefix: string; bill_prefix: string;
  date_format: 'DD MMM YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'; allow_overpayment: boolean; offer_receipt_after_save: boolean;
}
export interface Category { id: string; name: string; category_type: 'income' | 'expense'; system_key: string | null; usage_count: number }
export interface Ritual { id: string; name: string; receipt_title: string | null; default_amount: number | null; entry_count: number }
export interface EventRow { id: string; name: string; event_date: string; description: string | null; expense_total: number; income_total: number; expense_count: number }

export const useSettings = () => useQuery({
  queryKey: ['settings'],
  queryFn: () => get<{ settings: Settings; opening_balance: { amount: number; date: string; description: string } | null }>('/settings'),
  staleTime: 5 * 60_000,
});
export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => get<{ items: Category[] }>('/categories').then((r) => r.items), staleTime: 5 * 60_000 });
export const useRituals = () => useQuery({ queryKey: ['rituals'], queryFn: () => get<{ items: Ritual[] }>('/rituals').then((r) => r.items), staleTime: 5 * 60_000 });
export const useEvents = () => useQuery({ queryKey: ['events'], queryFn: () => get<{ items: EventRow[] }>('/events').then((r) => r.items) });

/** After any money change, refresh every view that summarises the ledger. */
export function useInvalidateMoney() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({
    predicate: (q) => !['settings', 'categories', 'rituals'].includes(String(q.queryKey[0])),
  });
}
