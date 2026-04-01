import { apiConfig } from '@/shared/api/config';
import { buildApiHeaders } from '@/shared/api/headers';
import { readJsonOrThrow } from '@/shared/api/response';

export async function apiRequest<T>(args: {
  path: string;
  method?: 'GET' | 'POST';
  sessionId?: string | null;
  idempotencyKey?: string | null;
  body?: unknown;
  cache?: RequestCache;
}): Promise<T> {
  const response = await fetch(`${apiConfig.origin}${args.path}`, {
    method: args.method ?? 'GET',
    headers: buildApiHeaders({
      contentType: args.body ? 'application/json' : undefined,
      sessionId: args.sessionId,
      idempotencyKey: args.idempotencyKey,
    }),
    body: args.body ? JSON.stringify(args.body) : undefined,
    cache: args.cache ?? 'no-store',
  });

  return readJsonOrThrow<T>(response);
}
