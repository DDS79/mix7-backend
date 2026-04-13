# mix7-backend-api

Canonical backend API repository for the Mix7 HTTP service.

Current operational domains may temporarily include `mix7.ru` and related subdomains, but they are not permanent architectural truth.

## Architecture Status

The current runtime core remains unchanged:

- `Actor` = ownership truth
- `Actor` = canonical MIX7 account root
- `AuthAccount` = linked identity / login method layer
- `AuthSession` = runtime access layer
- `Order` = commercial truth
- `Payment` = financial truth
- `Entitlement` / `AccessGrant` = access truth anchors

Canonical account ownership rule:

- one person maps to one backend `Actor`
- multiple login identities attach through `AuthAccount`
- Telegram is an external linked identity, not the canonical account root
- registrations, tickets, and payments remain actor-owned

This repository now also contains a minimal domain-foundation layer for future club operating system growth. It introduces explicit first-class concepts without implementing a full rules engine:

- identity and people:
  - `RoleAssignment`
  - `ContactPoint`
  - `Consent`
  - `NotificationPreference`
- events and programming:
  - `Event`
  - `EventCategory`
  - `EventCharacteristic`
- participation:
  - `Registration`
  - `Ticket`
- memberships / club cards:
  - `MembershipProduct`
  - `Membership`
  - `MembershipTier`
  - `MembershipEntitlement`
- venue foundation:
  - `Venue`
  - `VenueSlot`
- eligibility and attribution:
  - `AccessEligibility`
  - `DiscountEligibility`
  - `ReferralSource`
  - `Partner`
  - `CampaignAttribution`

These concepts are explicit domain anchors only. They do not change the current checkout, payment, session, or runtime architecture.

The first real product vertical is now implemented for Event / Registration / Ticket:

- public event catalog and event detail reads
- explicit registration artifact creation
- explicit ticket retrieval for issued tickets
- explicit free vs paid participation branching

## Bounded Contexts

- runtime/auth:
  - session validation, actor resolution, trust, policy gating
- commerce:
  - orders, payment intents, payment confirmation, idempotency
- access:
  - entitlements and access grants
- domain foundation:
  - events, participation, memberships, venue anchors, consent, attribution

## Anti-overload Positions

- club card is not a ticket
- membership is sold through checkout, but remains a separate concept
- ticket remains an event-specific access artifact
- discount eligibility is not access eligibility
- slot access is not a fake event ticket
- roles/personas must not collapse into `Actor.kind`
- contact/consent must not collapse into `ActorProfile.metadata`
- referral/partner attribution must not remain free-form forever
- frontend must not become the home of business rules

## What Exists Now / Reserved / Deferred

Implemented now:
- explicit type-level domain concepts in `domain_foundation.ts`
- schema stub reservation in `test_stubs/db-schema.ts`
- invariant tests proving separation from current runtime/commerce anchors
- storage-backed in-memory Event / Registration / Ticket vertical
- event catalog/detail APIs
- registration create API
- ticket retrieval API

Reserved for later:
- operational check-in flows
- loyalty wallet and ledger engine
- campaign orchestration and delivery logging
- partner settlement workflows

Deferred intentionally:
- full membership rules engine
- full venue slot occupancy engine
- dynamic pricing engine
- full CRM automation
- staff/volunteer scheduling and check-in operations

## Entity Glossary

- `Event`: programming subject, not derived from orders
- `Registration`: participation intent/approval artifact
- `Ticket`: event-specific access artifact
- `Membership`: ongoing non-ticket access container created after membership-product purchase
- `VenueSlot`: anchor for space/time usage, distinct from events
- `AccessEligibility`: explicit admission/usage eligibility surface
- `DiscountEligibility`: explicit pricing-eligibility surface
- `ContactPoint`: auditable contact channel
- `Consent`: auditable permission state
- `CampaignAttribution`: acquisition/referral/partner source record

## Roadmap Note

- NOW:
  - explicit domain anchors and anti-overload positions
- NEXT:
  - storage-backed event, registration, ticket, membership, and attribution flows
- LATER:
  - richer rules engines and operational tooling

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the bounded-context map and current platform posture.

## Engineering Operating System

This repository now also carries lightweight engineering-process artifacts so "done" does not stop at local code:

- [docs/process/DEFINITION_OF_DONE.md](./docs/process/DEFINITION_OF_DONE.md)
- [docs/process/RELEASE_CHECKLIST.md](./docs/process/RELEASE_CHECKLIST.md)
- [docs/process/POST_DEPLOY_VERIFICATION.md](./docs/process/POST_DEPLOY_VERIFICATION.md)
- [docs/process/ENVIRONMENT_MATRIX.md](./docs/process/ENVIRONMENT_MATRIX.md)
- [docs/process/VERTICAL_DELIVERY_TEMPLATE.md](./docs/process/VERTICAL_DELIVERY_TEMPLATE.md)

These documents exist to prevent:

- local code ahead of live deploy
- `/health`-only verification
- frontend integrating against routes that are not yet live
- unclear release boundaries
- confusion between foundation implemented, local implementation done, live route proven, and user flow proven

## Routes

- `GET /health`
- `GET /events`
- `GET /events/:slug`
- `POST /session/issue`
- `POST /registrations`
- `GET /tickets/:ticketId`
- `GET /debug/session-context`
- `POST /checkout/payment-intent`
- `POST /checkout/payment-confirm`

## Event / Registration / Ticket Flow

- `GET /events`
  - returns the published event catalog
- `GET /events/:slug`
  - returns event detail, category, characteristics, and pricing mode
- `POST /registrations`
  - requires runtime session
  - creates explicit registration artifact bound to actor + event
  - for free events:
    - returns `nextAction = ticket_ready`
    - issues explicit ticket immediately
  - for paid events:
    - returns `nextAction = checkout`
    - creates explicit registration and explicit checkout order
    - does not issue ticket before financial completion
- `GET /tickets/:ticketId`
  - requires runtime session
  - returns owned issued ticket only

This preserves:
- `Event != Order`
- `Registration != Order`
- `Ticket != Entitlement`
- free-event handling without hidden free-order hacks
- paid-event handling without bypassing checkout truth

## Scripts

- `npm run build`
- `npm test`
- `npm run start`

## Render

The repository includes `render.yaml` and is intended to be the Render web-service source instead of the Telegram bot repository.

## Domain / Origin Portability

- current operational web origins may temporarily include `https://mix7.ru` and `https://www.mix7.ru`
- this is temporary operational configuration, not product truth
- backend route semantics do not depend on the current domain name
- explicit allowed web origins are resolved through backend runtime config
- wildcard origin fallback is forbidden
- future domain migration should be handled by configuration and documentation updates, not backend redesign

Current runtime config surfaces:
- `APP_ENV`
  - `production` by default
  - supported values:
    - `production`
    - `development`
    - `smoke`
- `ALLOWED_WEB_ORIGINS`
  - comma-separated explicit production origin allowlist
  - defaults to the current operational domains only
- `ALLOWED_DEV_WEB_ORIGINS`
  - comma-separated explicit development/smoke origin allowlist
  - additive only in non-production `APP_ENV`
  - localhost support must never be mixed implicitly into production defaults
- `TICKET_QR_NAMESPACE`
  - optional ticket QR namespace
  - defaults to neutral `clubos:ticket`

Operational naming such as repository name or Render service name may still mention `mix7`; those are deployment labels, not route-contract truth.

## Frontend Phase-1

An isolated Next.js phase-1 frontend now lives in [frontend/](./frontend).

- frontend docs:
  - [frontend/README.md](./frontend/README.md)
  - [frontend/ARCHITECTURE.md](./frontend/ARCHITECTURE.md)
- backend remains the source of truth
- frontend env/config portability is centralized and domain-safe
- local vs live origin distinctions are recorded in [docs/process/ENVIRONMENT_MATRIX.md](./docs/process/ENVIRONMENT_MATRIX.md)
