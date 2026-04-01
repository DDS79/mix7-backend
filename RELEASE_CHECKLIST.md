# Release Checklist

Use this checklist for every backend or frontend release slice. The goal is to prevent local/git/live drift and to make release scope explicit.

## 1. Release Boundary

- Release name:
- Vertical / scope:
- Exact routes affected:
- Exact files included:
- Exact files intentionally excluded:
- Why this release is narrow enough:

## 2. Source Alignment

- Current branch:
- Working tree status reviewed:
- Unrelated local work identified:
- Clean worktree or equivalent isolation used if needed:
- Commit SHA created for this release:
- Push target branch:

## 3. Local Verification

- Build command run:
- Test command run:
- Route-specific tests run:
- Manual local verification performed:
- Known local limitations:

## 4. Deploy Proof

- Deploy source matches pushed commit SHA:
- Deployment platform / service:
- Deploy completion signal observed:
- Live backend origin:
- Live frontend origin, if applicable:

## 5. Product Route Verification

`/health` is required but never sufficient alone.

- `GET /health`
- relevant product reads:
- relevant product writes:
- relevant route detail reads:
- expected response classes verified:
- repeated check performed after deploy propagation:

## 6. Known Limitations

- deferred behaviors:
- not proven in this release:
- follow-up tasks:

## 7. Release Verdict

- Local-ready: yes / no
- Commit-ready: yes / no
- Live route proven: yes / no
- User flow proven: yes / no

## Example: Event / Registration / Ticket Vertical

- scope:
  - `GET /events`
  - `GET /events/:slug`
  - `POST /registrations`
  - `GET /tickets/:ticketId`
- commit:
  - `821326e feat: add event registration ticket vertical`
- live proof:
  - `/health` -> `200`
  - `/events` -> `200`
  - `/events/open-studio-day` -> `200`
  - free-event registration -> `ticket_ready`
  - ticket read -> `200`
