# pstack-zcode

pstack (Lauren @poteto's Cursor coding workflow) adapted for ZCode. The repo root is pstack's tree; upstream (`cursor/plugins`, pstack subtree only) syncs via `scripts/sync-upstream.sh` (git subtree). Adaptation rules: `docs/adr/`; vocabulary: `GLOSSARY.md`.

## Agent skills

### Issue tracker

Issues are tracked on GitHub (`ChHsiching/pstack-zcode`) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map 1:1 to same-named GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.
