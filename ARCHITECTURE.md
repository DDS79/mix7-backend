# MIX7 Backend Architecture

## Current Core

These runtime and truth anchors are already established and remain unchanged:

- `Actor` = ownership truth
- `AuthSession` = runtime access layer
- `Order` = commercial truth
- `Payment` = financial truth
- `Entitlement` = product truth
- `AccessGrant` = access truth

The current checkout/runtime path is intentionally narrow and deterministic. This document records the explicit domain foundation added around that core so future club-operating concepts do not leak into metadata, orders, tickets, or frontend logic.

## Operational Domain Posture

- current work/testing may temporarily use `mix7.ru` and related subdomains
- this does not make `mix7.ru` permanent architectural truth
- backend origin handling is an explicit security policy, not a brand truth
- future domain migration should be config-driven where appropriate
- wildcard CORS fallback is forbidden
- production origins must remain separate from development/smoke origins
- localhost support is development/smoke-only policy, not production truth

## Engineering Readiness Posture

Architecture truth alone is not sufficient release truth.

This repository distinguishes:

- foundation implemented
- local implementation done
- live route proven
- user flow proven

Release verification must always go beyond `/health` and include product-route proof. See:

- [docs/process/DEFINITION_OF_DONE.md](./docs/process/DEFINITION_OF_DONE.md)
- [docs/process/RELEASE_CHECKLIST.md](./docs/process/RELEASE_CHECKLIST.md)
- [docs/process/POST_DEPLOY_VERIFICATION.md](./docs/process/POST_DEPLOY_VERIFICATION.md)
- [docs/process/ENVIRONMENT_MATRIX.md](./docs/process/ENVIRONMENT_MATRIX.md)
- [docs/process/VERTICAL_DELIVERY_TEMPLATE.md](./docs/process/VERTICAL_DELIVERY_TEMPLATE.md)

## Bounded Contexts

### Runtime / Identity

- actor and ownership
- auth accounts and profiles
- sessions, trust, registration policy
- explicit runtime config for allowed web origins

### Commerce

- checkout order source
- payment intent / confirm
- provider-truth payment state
- idempotency

### Access

- entitlement issuance
- access grants
- runtime access validation

### Domain Foundation

- events and taxonomy
- participation artifacts
- memberships and club cards
- venue and slot anchors
- contact and consent
- partner/referral attribution
- eligibility surfaces

## What Exists Now

Implemented explicitly now:

- identity / people:
  - `RoleAssignment`
  - `ContactPoint`
  - `Consent`
  - `NotificationPreference`
- events / programming:
  - `Event`
  - `EventCategory`
  - `EventCharacteristic`
- participation:
  - `Registration`
  - `Ticket`
- memberships:
  - `MembershipProduct`
  - `Membership`
  - `MembershipTier`
  - `MembershipEntitlement`
  - `MembershipLifecycleStatus`
- venue:
  - `Venue`
  - `VenueSlot`
- eligibility:
  - `AccessEligibility`
  - `DiscountEligibility`
- growth / attribution:
  - `ReferralSource`
  - `Partner`
  - `CampaignAttribution`

These are currently explicit domain anchors and schema reservations. They are not yet full route-exposed business flows.

## Implemented Product Vertical

The first product vertical now exists on top of the runtime/commerce core:

- Event catalog
- Event detail
- Registration creation
- Ticket retrieval

### Event

- explicit programmed subject
- public read surface
- category and characteristic references
- pricing mode:
  - free
  - paid

### Registration

- explicit participation artifact
- bound to actor and event
- never overloaded into order
- may create checkout order for paid events
- may directly issue ticket for free events

### Ticket

- explicit event-specific access artifact
- distinct from membership
- distinct from entitlement
- retrievable by owner session
- barcode/QR reservation included in ticket DTO

### Free vs Paid Participation

Free event path:
- event read
- registration create
- registration approved immediately
- ticket issued immediately
- response returns `nextAction = ticket_ready`

Paid event path:
- event read
- registration create
- registration stays explicit and separate from order
- checkout order created explicitly
- response returns `nextAction = checkout`
- ticket is not issued before financial completion

## What Is Reserved

Reserved structurally, not fully implemented:

- richer event series/program surfaces
- guest-list and accreditation flows
- venue zones and operational check-in
- loyalty wallet/ledger
- delivery logs and campaign orchestration
- staff and volunteer operations

## What Is Deferred

Deferred intentionally until first event/registration/membership flows stabilize:

- full membership rules engine
- dynamic pricing engine
- slot occupancy engine
- CRM automation
- partner settlement workflows
- advanced operational consoles

## Anti-overload Positions

- club card is not a ticket
- membership is sold through checkout, but is a separate domain concept afterward
- ticket remains event-specific
- event is not derived from order
- registration is not equivalent to ticket
- slot access is not a fake event ticket
- discount eligibility is not access eligibility
- contact/consent must remain explicit and auditable
- roles/personas must not collapse into `Actor.kind`
- referral and partner attribution must not remain free-form only
- frontend must not become the home of domain rules

## Domain / Brand Coupling Boundaries

Safe to remain operational for now:
- repository/service labels containing `mix7`
- deployment service name in `render.yaml`

Must remain configurable or neutral:
- allowed web origins
- ticket QR namespace

## Origin Policy Model

- `APP_ENV=production`
  - only `ALLOWED_WEB_ORIGINS` are effective
- `APP_ENV=development` or `APP_ENV=smoke`
  - effective origins are:
    - `ALLOWED_WEB_ORIGINS`
    - plus `ALLOWED_DEV_WEB_ORIGINS`
- wildcard origins are forbidden
- origin values must be origin-only:
  - no path
  - no query
  - no fragment
- localhost support must be explicit and additive, never implicit in production

Must not become permanent:
- hardcoded frontend/backoffice/public domain assumptions inside route semantics

## NOW / NEXT / LATER

### NOW

- first-class domain anchors
- schema reservations
- invariant tests and documentation
- lightweight engineering operating system artifacts for release/readiness discipline

### NEXT

- storage-backed event, registration, ticket, membership, venue-slot, and attribution flows
- check-in and zone-aware access surfaces

### LATER

- rules engines
- loyalty and CRM engines
- richer operations tooling
