# Environment Matrix

This matrix exists to prevent local/frontend/live confusion.

## Environment Types

| Surface | Purpose | Typical Origin / Path | Source Of Truth | Notes |
| --- | --- | --- | --- | --- |
| local backend | backend coding and tests | local Node process | local working tree | may be ahead of git/live |
| live backend | real shared backend | `https://mix7-backend-api.onrender.com` | deployed commit on `main` | must be used for live route proof |
| local frontend | manual product validation | `http://127.0.0.1:3001` | local frontend working tree | should point to explicit API origin via env |
| preview frontend | optional future preview surface | platform-specific | preview deploy source | not assumed to exist |
| current operational web domain | temporary public brand/domain | `mix7.ru` family | operational config only | not permanent architectural truth |
| future permanent domain | later stable public brand/domain | TBD | env/config and docs | should require config change, not redesign |

## Current Frontend Env Contract

Local frontend env keys:

- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_BRAND_TAGLINE`
- `NEXT_PUBLIC_API_ORIGIN`
- `NEXT_PUBLIC_SITE_URL`

Rules:

- feature code must not hardcode current public domains
- `NEXT_PUBLIC_API_ORIGIN` must identify the exact backend surface under test
- a live frontend is not proof of a live backend route unless the live backend origin is checked directly

## Backend Origin Policy

- `APP_ENV=production`
  - effective origins come only from `ALLOWED_WEB_ORIGINS`
- `APP_ENV=development` or `APP_ENV=smoke`
  - `ALLOWED_DEV_WEB_ORIGINS` may be added explicitly
- localhost support is not architectural truth
- wildcard origin fallback is forbidden

## Release Readiness Questions

Before declaring a vertical usable, answer:

- Is it local-only?
- Is it committed?
- Is it deployed?
- Which exact origin was verified?
- Were product routes checked on that origin?
