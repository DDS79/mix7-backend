# Release Checklist

Use this checklist for every backend or frontend release slice.

Purpose:
- make release scope explicit
- prevent local/git/live mismatch
- force product-route verification beyond `/health`

## 1. Scope Declaration

- release name:
- vertical / objective:
- exact routes affected:
- exact files included:
- exact files intentionally excluded:
- why this release is narrow enough:

## 2. Source Alignment

- current branch:
- working tree reviewed:
- unrelated local work identified:
- clean worktree / stash / other isolation used if needed:
- commit SHA:
- push target:

## 3. Local Verification

- build command run:
- tests run:
- route-specific tests run:
- manual local verification run:
- known local limitations:

## 4. Deploy Handoff

- deploy platform / service:
- deploy source branch:
- deploy completion signal observed:
- live backend origin:
- live frontend origin, if applicable:

## 5. Live Verification

`/health` is required but never sufficient alone.

- `GET /health`
- product reads verified:
- product writes verified:
- route-detail reads verified:
- expected response classes captured:
- repeated check after deploy propagation:

## 6. Limitations / Rollback

- known limitations:
- not proven in this release:
- rollback note:
- follow-up tasks:

## 7. Release Verdict

- local-ready: yes / no
- committed-ready: yes / no
- deployed-ready: yes / no
- live-route-proven: yes / no
- user-flow-proven: yes / no

## Worked Example: Event / Registration / Ticket Vertical

- routes:
  - `GET /events`
  - `GET /events/:slug`
  - `POST /registrations`
  - `GET /tickets/:ticketId`
- narrow release commit:
  - `821326e feat: add event registration ticket vertical`
- live proof:
  - `/health` -> `200`
  - `/events` -> `200`
  - `/events/open-studio-day` -> `200`
  - free-event registration -> `ticket_ready`
  - ticket retrieval -> `200`
