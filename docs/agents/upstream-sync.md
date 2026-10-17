# Upstream sync: a four-phase loop — analyze, merge, review, test

The procedure for taking upstream (`cursor/plugins`, `pstack/` subtree) changes into this repo. Read it before every sync; it encodes the adaptation discipline and the quality loop from rounds 1–2 so nobody has to re-derive either.

## When to sync

Absorb **released** versions only: the trigger is a version bump in upstream `pstack/plugin.json`. The weekly CI patrol reports new versions and does nothing else. Unreleased dev commits on `upstream/main` wait for their release (as of 2026-10-17: #637, a Claude Code install-docs commit, sits unreleased on top of 0.15.25). When the user says "同步上游" — or the patrol reports a bump and the user says go — run the loop below.

## Phase 1 — Analyze (before any merge)

```sh
git fetch upstream main
LAST_BUMP=<previous release commit>          # e.g. 6ce45c5 = 0.15.25
git log --oneline $LAST_BUMP..upstream/main -- pstack   # the release's commits
git diff $LAST_BUMP upstream/main:pstack --stat          # true delta, tree to tree
```

The tree-to-tree form matters: never diff a subtree-split commit against unprefixed `upstream/main` — the pathspec mismatch produces phantom 170-file diffs (measured, 2026-10-17). The previous absorbed split tree is the second parent of the last `sync: absorb` merge.

Classify every file in the delta:

- **content evolution** (upstream editing its own text) — take as the base, re-apply our marks;
- **mechanism change or new Cursor concept** — research before rewriting: the zcode-guide plugin docs and the ZCode source (`github.com/zai-org/ZCode`) are primary sources, then a live check on this machine; swap to the equivalent or prune with an allowlist entry and a one-line reason;
- **new skill** — land it, prefix its frontmatter `name` with `pstack-`, adapt its mechanisms;
- **version bump** — goes into the commit message.

Expect conflicts only in adaptation-dense files: `README.md` (ours is a deliberate rewrite — assess upstream's README hunks manually and fold what is relevant, usually into the differences table), `setup-pstack`, `poteto-mode` and its playbooks, the panel skills (`arena`, `swarm`, `interrogate`, `architect`), the session skills (`recall`, `automate-me`, `session-pickup`), `reflect`, `worktree-audit.sh`, `agents/`, `automations/benny/`.

Red lines: ADR-0002 (upstream text stays English, minimal diff, no style rewrites — that is smuggling); adaptation marks from ADR-0004–0012 must survive; a new Cursor mechanism never gets swapped on guesswork.

## Phase 2 — Merge and re-apply

```sh
sh scripts/sync-upstream.sh
```

Fetches, re-splits the subtree, merges. Resolve conflicts per hunk:

1. **Upstream wins on content.** Take the upstream text as the base of every conflicted hunk.
2. **Re-apply our adaptation marks on top**: the `pstack-` prefix (frontmatter plus cross-references) and the established mechanism-swap wording.
3. For each hunk ask: is upstream evolving its own content (take as-is, re-prefix) or changing a Cursor mechanism (apply Phase 1's research)?

Zero structural conflicts is the norm; a rename/delete conflict means something deeper changed — stop and investigate before resolving.

## Phase 3 — Review

Mechanical regression checks first (the merge must not silently revert an adaptation):

- every `skills/**/SKILL.md` frontmatter `name` carries the `pstack-` prefix; count equals the skills-dir count;
- `sh scripts/cursor-residue-lint.sh` exits 0; any new allowlist entry carries a reason, stale entries are deleted;
- `sh scripts/resident-anchor-lint.sh` exits 0 (the summary still anchors to poteto-mode);
- grep the known marks in the merged tree: `.zcode` paths, the `session-store.py` helper sentences in recall / automate-me / session-pickup, `~/.zcode/pstack/models.md` references — the merged adapted files must differ from pre-merge only by upstream's hunks.

Then an independent reviewer with fresh eyes reads the whole merge diff (read-only): every resolved hunk follows the discipline, nothing of upstream's was dropped silently, nothing of ours was reverted, nothing extra was slipped in.

Stop and ask the owner when: a structural conflict appears; a new mechanism has no ZCode equivalent and sits on a workflow's main path; upstream rewrites something an ADR decided against (notably the model-role system or orchestrate topology); the absorbed version number changed (say it in the commit).

## Phase 4 — Test and release

Gates, in order: both lints green; `npx -y skills add . -l` discovery set changed only in step with upstream's changes; `zcode plugins validate` passes on the repo root; CI green.

Targeted real-machine checks by touched area — full T-series only when the touched set is large:

| touched area | check |
|---|---|
| poteto-mode or playbooks | route one small task through `/pstack-poteto-mode` |
| panel or orchestrate skills | one workflow fan-out spawn |
| session skills or worktree-audit | `session-store.py list` from the workspace root |
| setup-pstack | idempotent rerun |
| README or guides | link check plus both lints |

**Plugin release step** (since round 2 the collection ships as a plugin): bump `.zcode-plugin/plugin.json` and the `marketplace.json` entry to a new version, push. Plugin users update through the market flow — gear → marketplace sources → refresh the market, then Personal → the plugin → update. Without this step the market serves stale skills.

Commit as `sync: absorb upstream pstack vX.Y.Z`, body listing each conflict and how it was resolved.

## The loop

Any failure goes back to the phase that owns it: a review finding re-opens that hunk's merge; a test failure re-opens the fix; a mechanism discovered during review re-opens the research. Loop until every gate is green, then archive: note the analysis and outcome on the sync commit (or its issue), and record any new trade-off in the adaptation audit's ledger.
