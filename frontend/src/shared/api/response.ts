import { toApiError } from '@/shared/api/errors';

export async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as T;
}
