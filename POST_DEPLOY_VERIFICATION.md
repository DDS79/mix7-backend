# Post-Deploy Verification

Use this after every release. The goal is to prove the live product surface, not only service health.

## Required Verification Layers

## 1. Platform Reachability

- verify deploy target/origin
- verify deployed commit if the platform exposes it
- call `GET /health`

## 2. Product Route Reachability

Verify the routes touched by the release.

Examples:
- reads:
  - `GET /events`
  - `GET /events/:slug`
- writes:
  - `POST /registrations`
  - `POST /checkout/payment-intent`

## 3. Expected Response Class

Record:
- status code
- contract shape
- whether the response proves the intended branch

Examples:
- `200` event catalog response
- `201` registration created
- `404 ROUTE_NOT_FOUND` means release is not live for that route
- domain-negative result may still prove route availability

## 4. Repeatability

One call is not enough when deploy propagation is in flight.

- repeat product-route checks if the first call could be stale
- distinguish:
  - deploy lag
  - route absent
  - wrong origin
  - cold start

## 5. Evidence Record

Capture at minimum:
- live origin used
- exact commands run
- exact status codes
- exact route proofs
- known limitations

## Verification Rule

`/health` only:
- proves service is alive
- does not prove the released product vertical is live

Release verification is incomplete until the relevant product routes are proven.
