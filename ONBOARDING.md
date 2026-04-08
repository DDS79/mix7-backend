# MIX7 Onboarding

This repository is the onboarding source of truth for a new developer.

## Start Here

1. Read [handover/mix7_project_simple_description.txt](./handover/mix7_project_simple_description.txt)
2. Read [handover/mix7_project_for_new_developer.txt](./handover/mix7_project_for_new_developer.txt)
3. Read [handover/mix7_project_current_stage_and_next_plan.txt](./handover/mix7_project_current_stage_and_next_plan.txt)
4. Read [handover/mix7_project_status_and_2week_roadmap_simple.txt](./handover/mix7_project_status_and_2week_roadmap_simple.txt)
5. Read [handover/mix7_aiops_how_to_work_with_aiops_on_project.txt](./handover/mix7_aiops_how_to_work_with_aiops_on_project.txt)

## AIOps Control Layer

The engineering control layer lives in [project-control/](./project-control).

Core entrypoints:

- `bash project-control/report.sh today`
- `bash project-control/alert.sh today`
- `bash project-control/install-hooks.sh`

Protocol enforcement source:

- [project-control/hooks/commit-msg](./project-control/hooks/commit-msg)
- [project-control/src/validate-commit-msg.js](./project-control/src/validate-commit-msg.js)
- [.github/workflows/task-protocol.yml](./.github/workflows/task-protocol.yml)

## Required Handover Reports

- [handover/mix7_aiops_terminal_reporting_result.txt](./handover/mix7_aiops_terminal_reporting_result.txt)
- [handover/mix7_aiops_task_protocol_enforcement_result.txt](./handover/mix7_aiops_task_protocol_enforcement_result.txt)
- [handover/mix7_aiops_alert_layer_result.txt](./handover/mix7_aiops_alert_layer_result.txt)

## First Commands

Run from repository root:

```bash
bash project-control/report.sh today
bash project-control/alert.sh today
bash project-control/install-hooks.sh
```

## Working Rules

- Backend repository is the main engineering source of truth.
- Work contract-first and forensic-first.
- Prefer the smallest deterministic fix.
- Do not rely on local files outside this repository for onboarding context.
