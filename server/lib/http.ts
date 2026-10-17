import { z } from 'zod';

/** An error that maps directly onto an HTTP response: { error: { code, message, details } }. */
export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found`);
export const conflict = (message: string, details?: unknown) => new ApiError(409, 'conflict', message, details);
export const invalid = (message: string, details?: unknown) => new ApiError(422, 'invalid', message, details);

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = issues[0];
    throw new ApiError(400, 'validation_error', first ? `${first.path || 'input'}: ${first.message}` : 'Invalid input', issues);
  }
  return result.data;
}

/** Map Postgres constraint violations onto friendly API errors. */
export function fromDbError(err: unknown): ApiError | null {
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e?.code === '23505') return conflict('This record already exists', { constraint: e.constraint });
  if (e?.code === '23503') return conflict('This record is linked to other records and cannot be changed this way', { constraint: e.constraint });
  if (e?.code === '23514') return invalid('A value is outside the allowed range', { constraint: e.constraint });
  return null;
}
