# Post-Deploy Verification

Use this after every release.

Purpose:
- prove the live product surface
- distinguish deploy lag from missing routes or wrong origin
- stop `/health` from becoming the only release gate

## Verification Order

## 1. Confirm Environment

- exact live origin under test
- exact deploy target/service
- exact release commit if available from the platform

## 2. Platform Reachability

- call `GET /health`
- record status code and response body shape

## 3. Product Route Verification

Verify the routes touched by the release.

Examples:
- reads:
  - `GET /events`
  - `GET /events/:slug`
- writes:
  - `POST /registrations`
  - `POST /checkout/payment-intent`

If origin policy changed, also verify:
- preflight response for the intended origin
- actual response headers for the intended origin
- absence of wildcard `Access-Control-Allow-Origin`

## 4. Expected Response Classes

Capture:
- exact command
- exact status code
- whether the response proves the intended branch

Examples:
- `200` catalog/detail read
- `201` create action success
- `404 ROUTE_NOT_FOUND` means the release is not live for that route
- domain-negative result may still prove the route is live

## 5. If `/health` Works But Product Routes Fail

Do not stop.

Classify the failure:
- deploy lag
- wrong origin
- wrong branch/deploy source
- route not wired in live server
- contract mismatch

Repeat route checks if deploy propagation may still be in flight.

## 6. Proof Expectations

Record at minimum:
- origin used
- commands executed
- statuses observed
- relevant response excerpts
- known limitations

## Rule

Release verification is incomplete until the relevant product routes are proven live.
