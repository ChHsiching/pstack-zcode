# Prefix skill names via frontmatter only, keep upstream directories

Every adapted skill is renamed with the `pstack-` prefix (`pstack-tdd`, `pstack-poteto-mode`) by editing the SKILL.md `name` field only. Directory names stay upstream-identical.

Why both halves: the prefix makes every invocation unambiguous and immune to collisions with same-named skills from other collections (a real hazard: mattpocock/skills installs `tdd`/`teach`/`unslop`); the unchanged directories mean subtree merges carry zero structural rename conflicts.

## Consequences

- Callers always type `/pstack-<skill>`; the flagship entry is `/pstack-poteto-mode` (no special cases — uniformity was chosen over brevity).
- Internal cross-references between skills must be updated alongside the frontmatter renames.
