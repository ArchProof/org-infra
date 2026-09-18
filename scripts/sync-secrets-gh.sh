#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-ArchProof/org-infra}"
echo "Syncing secrets to $REPO using GitHub CLI..."

[ -n "${STATE_ENDPOINT:-}" ] && gh secret set STATE_ENDPOINT --body "$STATE_ENDPOINT" -R "$REPO" && echo "  ✅ STATE_ENDPOINT -> set"
[ -n "${STATE_BUCKET:-}" ]   && gh secret set STATE_BUCKET --body "$STATE_BUCKET" -R "$REPO" && echo "  ✅ STATE_BUCKET -> set"
[ -n "${STATE_ACCESS_KEY:-}" ] && gh secret set STATE_ACCESS_KEY --body "$STATE_ACCESS_KEY" -R "$REPO" && echo "  ✅ STATE_ACCESS_KEY -> set"
[ -n "${STATE_SECRET_KEY:-}" ] && gh secret set STATE_SECRET_KEY --body "$STATE_SECRET_KEY" -R "$REPO" && echo "  ✅ STATE_SECRET_KEY -> set"

if [ -n "${GOVERNANCE_PEM_PATH:-}" ] && [ -f "$GOVERNANCE_PEM_PATH" ]; then
  gh secret set GOVERNANCE_PEM < "$GOVERNANCE_PEM_PATH" -R "$REPO"
  echo "  ✅ GOVERNANCE_PEM -> set"
fi

echo -e "\nSync complete! Current secrets for $REPO:"
gh secret list -R "$REPO"
