import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ui';
import { useInvalidateMoney } from './data';
import { ApiError } from './api';

/** Standard save flow: run the request, refresh money views, toast, then navigate. */
export function useSave<TVars, TResult>(fn: (v: TVars) => Promise<TResult>, opts: {
  success?: string; to?: (r: TResult) => string | null; replace?: boolean; onDone?: (r: TResult) => void;
}) {
  const invalidate = useInvalidateMoney();
  const toast = useToast();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      invalidate();
      if (opts.success) toast(opts.success);
      opts.onDone?.(r);
      const to = opts.to?.(r);
      if (to) navigate(to, { replace: opts.replace ?? true });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : 'Something went wrong. Nothing was saved.', 'error'),
  });
}

export const METHODS = ['cash', 'upi', 'bank', 'cheque'] as const;
export const METHOD_VALUE: Record<(typeof METHODS)[number], string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', cheque: 'Cheque' };
