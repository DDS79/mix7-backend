import { apiConfig } from '@/shared/api/config';
import { ApiError } from '@/entities/api-error/model/apiError.types';
import { clearSessionState } from '@/entities/session/lib/sessionStorage';
import { buildApiHeaders } from '@/shared/api/headers';
import { readJsonOrThrow } from '@/shared/api/response';

function isRejectedSessionError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return false;
  }

  if (error.status !== 401) {
    return false;
  }

  if (error.code === 'SESSION_INVALID' || error.code === 'SESSION_REQUIRED') {
    return true;
  }

  if (error.message === 'Session was not found.' || error.message === 'Session header is required.') {
    return true;
  }

  return Boolean(error.details?.some((detail) => detail.message === 'Session was not found.'));
}

export async function apiRequest<T>(args: {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH';
  sessionId?: string | null;
  idempotencyKey?: string | null;
  body?: unknown;
  cache?: RequestCache;
}): Promise<T> {
  try {
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

    return await readJsonOrThrow<T>(response);
  } catch (error) {
    if (args.sessionId && isRejectedSessionError(error)) {
      clearSessionState();
    }

    throw error;
  }
}
