const required = [
  'NEXT_PUBLIC_APP_NAME',
  'NEXT_PUBLIC_API_ORIGIN',
  'NEXT_PUBLIC_SITE_URL',
] as const;

type RequiredKey = (typeof required)[number];

const publicEnv = {
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_API_ORIGIN: process.env.NEXT_PUBLIC_API_ORIGIN,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_BRAND_TAGLINE: process.env.NEXT_PUBLIC_BRAND_TAGLINE,
} as const;

function readRequired(key: RequiredKey) {
  const value = publicEnv[key]?.trim();
  if (!value) {
    throw new Error(`Missing required public env: ${key}`);
  }
  return value;
}

export const env = {
  appName: readRequired('NEXT_PUBLIC_APP_NAME'),
  brandTagline: publicEnv.NEXT_PUBLIC_BRAND_TAGLINE?.trim() || '',
  apiOrigin: readRequired('NEXT_PUBLIC_API_ORIGIN').replace(/\/$/, ''),
  siteUrl: readRequired('NEXT_PUBLIC_SITE_URL').replace(/\/$/, ''),
} as const;
