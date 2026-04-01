# MIX7 Frontend Phase-1

This package contains the first Next.js product frontend for the MIX7 backend.

## Scope

Implemented screens:

- `/events`
- `/events/[slug]`
- `/events/[slug]/register`
- `/checkout/[orderId]`
- `/tickets/[ticketId]`

## Architectural Rules

- backend remains source of truth
- session bootstrap is backend-owned
- registration branching is backend-owned
- feature modules do not hardcode current production domains
- all public config goes through `NEXT_PUBLIC_*`
- all API origin handling goes through `src/shared/lib/env.ts` and `src/shared/api/config.ts`

## Structure

- `app/`
  - routes and composition only
- `src/features/`
  - `events`
  - `registrations`
  - `checkout`
  - `tickets`
- `src/entities/`
  - `session`
  - `api-error`
- `src/shared/`
  - api transport
  - config/env
  - route constants
  - shared UI
- `src/widgets/`
  - `SessionBootstrap`
- `src/processes/`
  - flow-level nextAction resolution

## Config / Portability

Required env:

- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_BRAND_TAGLINE`
- `NEXT_PUBLIC_API_ORIGIN`
- `NEXT_PUBLIC_SITE_URL`

Future domain or brand move should require config changes only.

## Engineering Readiness

Frontend work must distinguish local-ready from live-ready.

- route/UI implementation is not live proof by itself
- backend product routes must be proven on the configured API origin
- `/health` alone is not enough for frontend/backend alignment

Relevant repo process docs:

- [`../docs/process/DEFINITION_OF_DONE.md`](../docs/process/DEFINITION_OF_DONE.md)
- [`../docs/process/POST_DEPLOY_VERIFICATION.md`](../docs/process/POST_DEPLOY_VERIFICATION.md)
- [`../docs/process/ENVIRONMENT_MATRIX.md`](../docs/process/ENVIRONMENT_MATRIX.md)
- [`../docs/process/VERTICAL_DELIVERY_TEMPLATE.md`](../docs/process/VERTICAL_DELIVERY_TEMPLATE.md)

## Honest Limitation

Phase-1 checkout uses backend registration handoff plus controlled client checkout storage because the backend does not yet expose an order-read API. The frontend does not invent paid-ticket issuance and does not claim ticket readiness for paid events before backend product issuance exists.
