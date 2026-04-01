import { ApiError, type ApiErrorPayload } from '@/entities/api-error/model/apiError.types';

export async function toApiError(response: Response): Promise<ApiError> {
  let payload: ApiErrorPayload | null = null;

  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    payload = null;
  }

  return new ApiError({
    code: payload?.error.code || 'HTTP_REQUEST_FAILED',
    message: payload?.error.message || `HTTP request failed with status ${response.status}.`,
    status: response.status,
    details: payload?.error.details,
  });
}
