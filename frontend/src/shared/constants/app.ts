import { env } from '@/shared/lib/env';

export const appConstants = {
  name: env.appName,
  tagline: env.brandTagline,
} as const;
