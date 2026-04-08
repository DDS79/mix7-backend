#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_HOOK="$REPO_ROOT/project-control/hooks/commit-msg"
TARGET_DIR="$REPO_ROOT/.git/hooks"
TARGET_HOOK="$TARGET_DIR/commit-msg"

mkdir -p "$TARGET_DIR"
cp "$SOURCE_HOOK" "$TARGET_HOOK"
chmod +x "$TARGET_HOOK"

echo "Installed commit-msg hook to $TARGET_HOOK"
