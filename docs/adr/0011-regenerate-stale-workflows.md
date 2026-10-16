# setup-pstack regenerates stale saved workflows after writing models.md

Saved panel workflows embed the model choices of the moment they were generated, and the workflow compiler refuses runtime-string model pins (fail-closed, ADR-0005) — so a models.md change strands every saved pstack workflow on the old panel. After writing models.md, setup-pstack mechanically compares each saved pstack workflow's embedded model literals against the new panel rows (grep the saved file, diff the sets; no skill gate needed to detect), then regenerates the stale ones with SaveWorkflow under the same name (same-name save replaces), loading the dynamic-workflows skill first because the tool refuses otherwise. Each overwrite still asks the user, same as any save.

## Considered Options

- Manual regeneration (round-1 status quo) — rejected: a documented "known limitation" whose removal is this round's mandate.
- Workflows that read models.md at runtime — rejected: the compiler's model-pin safety rule forbids it; that rule is correct and stays.
