import { env } from '@/shared/lib/env';

export const apiConfig = {
  origin: env.apiOrigin,
} as const;
