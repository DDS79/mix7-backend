#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: ./project-control/report.sh DATE [--full]" >&2
  echo "DATE: today | yesterday | YYYY-MM-DD" >&2
  exit 1
fi

node "$SCRIPT_DIR/src/report.js" "$@"
