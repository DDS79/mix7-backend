# MIX7 Frontend Phase-1 Architecture

## Scope

This frontend implements only the first product user flow:

- events list
- event detail
- registration
- checkout handoff
- ticket read

It is intentionally not a full membership, loyalty, CRM, slot, or operations frontend.

## Source of Truth

- backend owns session truth
- backend owns event truth
- backend owns registration branching
- backend owns ticket truth
- backend owns checkout/payment truth

Frontend does not derive ticket state, payment success, or registration branch locally.

## Layering

- `app/`
  - routing
  - layouts
  - screen composition
- `src/features/`
  - feature-specific API wrappers
- `src/entities/`
  - session
  - api-error
- `src/shared/`
  - env/config
  - api transport
  - route constants
  - UI primitives
- `src/widgets/`
  - session bootstrap shell behavior
- `src/processes/`
  - flow orchestration only

## Portability Rules

- no feature module may hardcode production domains
- no feature module may access `process.env` directly
- no feature module may own absolute API origin strings
- app/brand labels come from env/config only
- internal navigation uses route helpers only

A future domain or rebrand should require config changes only.

## Release / Verification Discipline

- frontend integration is blocked until the backend routes it consumes are live-route proven
- the configured `NEXT_PUBLIC_API_ORIGIN` must be treated as an explicit environment choice, not an assumption
- local frontend success does not prove live backend route availability
- use the repo-level release and verification artifacts before claiming a vertical usable

See:

- [`../docs/process/DEFINITION_OF_DONE.md`](../docs/process/DEFINITION_OF_DONE.md)
- [`../docs/process/POST_DEPLOY_VERIFICATION.md`](../docs/process/POST_DEPLOY_VERIFICATION.md)
- [`../docs/process/ENVIRONMENT_MATRIX.md`](../docs/process/ENVIRONMENT_MATRIX.md)

## Honest Limitation

The backend currently does not expose an order-read API for checkout summary retrieval.
Phase-1 handles this explicitly by storing backend-provided checkout handoff context in controlled browser session storage. This is a temporary contract bridge, not hidden business logic.

## Deferred

- paid-ticket issuance UI after final backend product issuance
- membership UI
- loyalty UI
- CRM/communications UI
- PWA install/offline flows
- global state library
