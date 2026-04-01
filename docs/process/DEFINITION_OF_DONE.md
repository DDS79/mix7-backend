# Definition Of Done

This repository uses explicit completion levels. "Done" must always name the level.

## 1. Foundation Done

Meaning:
- domain anchors, route contracts, or structural reservations exist
- invariants are documented
- separation tests may exist

Not enough for:
- frontend integration
- live product claims

## 2. Locally Implemented Done

Meaning:
- code exists in the local working tree
- build passes locally
- relevant tests pass locally
- route wiring exists locally where applicable

Not enough for:
- release claims
- deploy claims
- frontend assumptions against live backend

## 3. Committed Done

Meaning:
- the intended change set is committed
- release boundary is explicit
- unrelated local work is excluded

Not enough for:
- live route claims

## 4. Deployed Done

Meaning:
- the commit has been pushed to the real deploy source
- the deployment platform has picked it up

Not enough for:
- product-route proof

## 5. Live-Route-Proven Done

Meaning:
- live product routes on the real target origin are verified
- verification goes beyond `/health`
- expected response class is captured

Minimum proof:
- `/health`
- at least one relevant read route
- at least one relevant write route if the vertical includes writes

## 6. User-Flow-Proven Done

Meaning:
- the relevant end-to-end branch is exercised honestly on the intended environment
- backend remains source of truth
- expected next-step contract is proven

Examples:
- event catalog -> event detail -> registration -> ticket retrieval
- event detail -> registration -> checkout handoff

## Anti-Confusion Rules

- foundation done != locally implemented done
- locally implemented done != committed done
- committed done != deployed done
- deployed done != live-route-proven done
- live-route-proven done != user-flow-proven done
- `/health` green does not mean the vertical is live
- local frontend rendering does not prove live backend route availability
