# Vertical Delivery Template

Use this before implementing or releasing a new vertical.

## 1. Vertical Summary

- name:
- objective:
- out of scope:

## 2. Backend Surface

- routes to add/change:
- domain artifacts involved:
- required tests:
- config/env changes:

## 3. Frontend Surface

- screens involved:
- API origin expectation:
- backend source-of-truth assumptions:

## 4. Release Scope

- exact files expected in release:
- exact files explicitly excluded:
- deploy target:
- rollback note:

## 5. Verification Plan

- local build:
- local tests:
- live routes to verify:
- expected response classes:
- honest limitations:

## 6. Done Criteria

- foundation done when:
- locally implemented done when:
- committed done when:
- deployed done when:
- live-route-proven done when:
- user-flow-proven done when:

## 7. Rollout Notes

- known risks:
- dependency on other verticals:
- frontend/backend sequencing note:

## Worked Example Prompt

- "Which routes must be live before frontend work starts?"
- "What exact files belong to this release?"
- "Which product routes prove deploy success beyond `/health`?"
