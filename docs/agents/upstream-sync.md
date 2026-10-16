# Upstream sync: absorbing pstack changes without smuggling

The procedure for taking upstream (`cursor/plugins`, `pstack/` subtree) changes into this repo. Read it before every sync; it encodes the adaptation discipline so nobody has to re-derive it.

## Run

```sh
sh scripts/sync-upstream.sh
```

Fetches `upstream main`, re-splits the pstack subtree, merges. Conflicts are expected **only in files we adapted** (prefix lines, mechanism swaps). Zero structural conflicts is the norm: a rename/delete conflict means something deeper changed — stop and investigate before resolving.

## Resolving conflicts

1. **Upstream wins on content.** Take the upstream text as the base of every conflicted hunk.
2. **Re-apply our adaptation marks on top**: the `pstack-` prefix (frontmatter `name` plus cross-references in prose) and the established mechanism-swap wording.
3. For each hunk ask: is this upstream *evolving its own content* (take it as-is, re-prefix) or upstream *changing a Cursor mechanism* (see below)? Most conflicts are the former.

## When upstream introduces a new Cursor mechanism

- Detect: upstream diff contains a Cursor concept not covered by our mapping (a new tool name, path, platform feature).
- Act: **research before rewriting** — the zcode-guide plugin docs and the ZCode source (`github.com/zai-org/ZCode`) are the primary sources for an equivalent mechanism. Then:
  - equivalent exists → minimal swap, in upstream's own wording;
  - no equivalent → prune the reference and record an allowlist entry with a one-line reason.
- Never: rewording for style, translating, drive-by improvements, additions. That is smuggling (`docs/adr/0002`). Read the `writing-for-agents` skill before editing any markdown.

## Verify

- `sh scripts/cursor-residue-lint.sh` exits 0 (add allowlist entries only with a reason; delete entries that no longer match).
- `npx -y skills add <repo-path> -l` — the discovered set matches the `skills/*/SKILL.md` frontmatter names.
- Upstream added a skill → its `name` field carries the `pstack-` prefix before commit.
- Upstream bumped `plugin.json` version → mention the new version in the commit.

Commit as `sync: absorb upstream pstack vX.Y.Z`, body listing each conflict and how it was resolved.

## Stop and ask the owner when

- a structural conflict appears (rename/delete);
- a new mechanism has no ZCode equivalent and sits on a workflow's main path;
- upstream rewrites something an ADR was decided against (notably the model-role system or orchestrate topology).
