# Session listing goes through the local session store, read-only

ZCode has no session-listing API: `ReadSessionContext` stays the content channel (one `sess_*` id at a time, main thread only). The listing route is ZCode's own local session database (`~/.zcode/cli/db/db.sqlite`), queried read-only: WAL mode makes concurrent reads safe while the host writes, `mode=ro` never touches `-wal`/`-shm`, and `immutable=1` is forbidden — it misses un-checkpointed WAL data. The schema has been add-only since 0.2.0 (migrations verified against the local install and the ZCode source), and stored session ids are the same `sess_*` form the context tool takes, so listed ids feed `ReadSessionContext` unchanged.

History-mining surfaces (recall, automate-me, session pickup, worktree-audit's LAST_CHAT column) reach the store through one shared helper shipped inside the poteto-mode skill — the one addition to the upstream subtree this round, because a repo-level `scripts/` file cannot ship with the skills collection. Every query scopes to the active workspace directory; the upstream privacy rule (never read another project's sessions) carries over unchanged. Access is fail-closed: probe file → open read-only → required tables/columns → `sess_%` id sentinel, and any failure falls back to the round-1 behavior of asking the user for explicit ids.

## Considered Options

- ReadSessionContext-only (round-1 status quo) — rejected: "cannot proactively review history" stays a permanent loss (audit §四).
- Inline query snippets in each skill — rejected: the same query repeated across skills drifts; one helper is a single source of truth.
- A repo-level `scripts/` helper — rejected: the skills CLI ships `skills/` only; an installed skill cannot reach repo files.
