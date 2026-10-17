# Resident mode is an opt-in SessionStart hook, never default

Upstream keeps Custom Mode on for the whole session (Option+Enter); round 1 settled on per-task `/pstack-poteto-mode` because Q8 rejected any global mode change by default. The resident option keeps Q8 intact by moving the opt-in to the user: the repo ships `scripts/resident/` — a condensed poteto-mode summary, a zero-dependency node inject script, and an idempotent installer with `--remove` — that registers a SessionStart hook in the user-level config. The hook injects roughly 300 tokens into each new session when poteto-mode is installed, and does nothing otherwise; SessionStart injection cannot block or fail a session.

**Addendum (2026-10-17, owner request):** the distribution vehicle changed from `scripts/resident/` to a ZCode plugin, `plugins/pstack-resident/`. The skills CLI cannot carry hooks (the round-2 research's distribution gap), and a plugin can: installing the plugin is the entire opt-in, removing it the entire opt-out, and no config file is touched. The summary, the per-project gating (probe poteto-mode from the session directory), the ~300-token cost, and the anchor lint are unchanged; the lint now pins `plugins/pstack-resident/resident-summary.md`. Q8 still holds — nothing resident ships by default.

The summary lives outside the upstream subtree (ADR-0002 forbids additions there), so it does not ship with the skills collection — a documented distribution gap. A lint check pins the summary's structural anchors to `skills/poteto-mode/SKILL.md` so the two texts cannot drift silently.

## Considered Options

- A default-on global hook — rejected: Q8 (the user explicitly declined always-on by default).
- The summary inside `skills/poteto-mode/` — rejected: ADR-0002 upstream-subtree discipline.
