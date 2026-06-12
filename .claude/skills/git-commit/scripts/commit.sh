#!/usr/bin/env bash
# Usage: commit.sh "feat: your commit message"

set -euo pipefail

MESSAGE="${1:-}"

if [[ -z "$MESSAGE" ]]; then
  echo "Error: commit message required" >&2
  echo "Usage: commit.sh \"feat: your message\"" >&2
  exit 1
fi

# Check for any changes to commit
if git diff --cached --quiet && git diff --quiet; then
  echo "Error: no changes to commit" >&2
  exit 1
fi

# Stage all changes
git add -A

# Commit
git commit -m "$MESSAGE"

echo "Committed: $MESSAGE"
