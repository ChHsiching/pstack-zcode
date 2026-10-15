# Track only the pstack subtree, synced via git subtree

We want upstream pstack updates without carrying the whole `cursor/plugins` monorepo (19 unrelated sibling plugins). The repo root **is** pstack's tree (from v0.15.24 @ `1e5c90a`); upstream ancestry was recorded with `git subtree split --prefix=pstack` plus a `-s ours` merge, so future syncs are plain subtree merges — run `scripts/sync-upstream.sh`.

## Considered Options

- Full monorepo mirror + sparse checkout — rejected: the GitHub repo contained every sibling plugin, and `npx skills add` scanned them.
- Manual copy or dual directories — rejected: two sources of truth, guaranteed drift.

## Consequences

- Establishing this shape rewrote `main` (force push); the pre-restructure mirror survives only in the local `main-backup` branch.
- Upstream changes outside `pstack/` can never enter this repo.
