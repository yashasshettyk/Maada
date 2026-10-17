import { z } from 'zod';
import { MAX_AMOUNT_PAISE } from '../../shared/money.js';
import { isValidISODate } from '../../shared/dates.js';

export const uuid = z.string().uuid();
export const isoDate = z.string().refine(isValidISODate, 'must be a valid date (YYYY-MM-DD)');
export const paise = z.number().int('must be in whole paise').min(0).max(MAX_AMOUNT_PAISE);
export const positivePaise = paise.refine((v) => v > 0, 'must be greater than zero');
export const text = (max: number) => z.string().trim().min(1, 'is required').max(max);
/** Optional free text: empty strings are stored as NULL. */
export const optText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const rangeQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});
