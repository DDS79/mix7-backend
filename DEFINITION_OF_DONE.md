# Definition Of Done

This repository distinguishes four different completion levels. "Done" must always name the level explicitly.

## 1. Foundation Implemented

Meaning:
- domain anchors, route contracts, or structural reservations exist in code
- invariants are documented
- tests may prove shape/separation only

Not enough for:
- frontend integration
- live product claims

## 2. Local Implementation Done

Meaning:
- code exists in the working tree
- build passes locally
- relevant tests pass locally
- route wiring exists locally where applicable

Not enough for:
- release claims
- frontend consumption against live backend

## 3. Live Route Proven

Meaning:
- code is committed and pushed to the real deploy source
- deploy platform has picked up that commit
- relevant product routes are verified on the real live origin
- verification goes beyond `/health`

Minimum proof:
- `/health`
- at least one route read
- at least one route write if the vertical includes writes
- route-specific expected response shape

## 4. User Flow Proven

Meaning:
- the relevant end-to-end product branch is exercised honestly
- backend remains source of truth
- expected next-step contract is proven live

Examples:
- event catalog -> event detail -> registration -> ticket retrieval
- registration -> checkout handoff

## Rule

Do not say "done" without one of these qualifiers:

- foundation-only done
- local implementation done
- live route proven
- user flow proven
