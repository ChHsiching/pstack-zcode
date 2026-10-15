# Adaptation is mechanism-swap only (minimal diff)

Every change to upstream content must swap a Cursor-specific mechanism for its ZCode equivalent — nothing else. Skill bodies stay in English, keep upstream's wording and structure, and add no embellishments. If a passage is editor-agnostic, it is not touched.

This is the repo's charter: diffs should read as "same workflow, different editor", which is what keeps subtree merges small and reviewable, and what makes adapted skills trustworthy to people who know pstack.

## Consequences

- No Chinese, no rewrites "while we're in there", no drive-by improvements — those go upstream or nowhere.
- When upstream rewrites a passage we adapted, conflicts are small and local.
