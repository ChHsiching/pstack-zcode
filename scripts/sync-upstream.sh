#!/usr/bin/env sh
# Sync the pstack subtree from upstream cursor/plugins into this repo.
# Rationale: docs/adr/0001-pstack-subtree-as-repo-root.md
set -eu

git fetch upstream main
REV="$(git subtree split --prefix=pstack upstream/main | tail -n 1)"
echo "upstream pstack tip: $REV"
git merge "$REV"
