# Environment Matrix

This matrix exists to reduce local / preview / live confusion.

## Environment Surfaces

| Surface | Purpose | Typical Origin / Path | Source Of Truth | Temporary Or Structural |
| --- | --- | --- | --- | --- |
| local backend | backend coding and tests | local Node process | local working tree | temporary |
| live backend | shared backend for real verification | `https://mix7-backend-api.onrender.com` | deployed commit on `main` | operational |
| local frontend | manual product validation | `http://127.0.0.1:3001` | local frontend working tree | temporary |
| preview frontend | optional preview deployment | platform-specific | preview deploy source | temporary |
| current operational domain | current public brand/domain | `mix7.ru` family | operational config | temporary |
| future permanent domain | later stable public domain | TBD | env/config + docs | structural target |

## API Origin Usage

- frontend must get API origin from env/config
- local frontend success does not prove live backend route availability
- live backend route proof must be executed directly against the live backend origin

## Env Responsibility Boundaries

- frontend public env:
  - `NEXT_PUBLIC_APP_NAME`
  - `NEXT_PUBLIC_BRAND_TAGLINE`
  - `NEXT_PUBLIC_API_ORIGIN`
  - `NEXT_PUBLIC_SITE_URL`
- backend runtime config:
  - `APP_ENV`
  - explicit production origins
  - explicit development/smoke origins
  - explicit operational naming/config surfaces

## Temporary vs Structural

Temporary:
- local URLs
- current operational `mix7.ru` family
- preview surfaces when they exist

Structural:
- backend as source of truth
- env-driven frontend configuration
- config-driven future domain migration

## Backend Origin Separation

- production mode:
  - only production origins are effective
- development/smoke mode:
  - development origins are additive
- localhost origins must never be implicitly active in production mode
- any origin-policy change must be verified with both:
  - preflight headers
  - actual route response headers

## Release Readiness Questions

- is the feature only local?
- is it committed?
- is it deployed?
- which exact origin was checked?
- were product routes checked there, or only `/health`?
