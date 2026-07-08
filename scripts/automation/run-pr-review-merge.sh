#!/usr/bin/env bash
set -euo pipefail

export PATH="${CODEX_PR_AUTOMATION_PATH:-$HOME/.local/share/pnpm:$HOME/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
PROMPT_FILE="$SCRIPT_DIR/pr-review-merge.prompt.md"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="${CODEX_PR_AUTOMATION_LOG_DIR:-$HOME/.cache/codex/fastgpt-community-plugins/pr-review-merge}"
LOCK_DIR="${CODEX_PR_AUTOMATION_LOCK_DIR:-/tmp/fastgpt-community-plugins-pr-review-merge.lock}"

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 127
  fi
}

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

mkdir -p "$LOG_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$(date -u +%FT%TZ) another pr-review-merge run is active; exiting"
  exit 0
fi
trap cleanup EXIT

require_command codex
require_command gh
require_command git

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run 'gh auth login' before enabling this automation." >&2
  exit 1
fi

if ! git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Repository root is not a Git work tree: $REPO_ROOT" >&2
  exit 1
fi

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Missing prompt file: $PROMPT_FILE" >&2
  exit 1
fi

{
  printf 'Scheduled run id: %s\n' "$RUN_ID"
  printf 'Repository root: %s\n\n' "$REPO_ROOT"
  cat "$PROMPT_FILE"
} | codex --ask-for-approval "${CODEX_PR_AUTOMATION_APPROVAL:-never}" exec \
  --cd "$REPO_ROOT" \
  --sandbox "${CODEX_PR_AUTOMATION_SANDBOX:-danger-full-access}" \
  - \
  2>&1 | tee "$LOG_DIR/$RUN_ID.log"
