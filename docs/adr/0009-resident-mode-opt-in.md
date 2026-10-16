# Resident mode is an opt-in SessionStart hook, never default

Upstream keeps Custom Mode on for the whole session (Option+Enter); round 1 settled on per-task `/pstack-poteto-mode` because Q8 rejected any global mode change by default. The resident option keeps Q8 intact by moving the opt-in to the user: the repo ships `scripts/resident/` — a condensed poteto-mode summary, a zero-dependency node inject script, and an idempotent installer with `--remove` — that registers a SessionStart hook in the user-level config. The hook injects roughly 300 tokens into each new session when poteto-mode is installed, and does nothing otherwise; SessionStart injection cannot block or fail a session.

The summary lives outside the upstream subtree (ADR-0002 forbids additions there), so it does not ship with the skills collection — a documented distribution gap. A lint check pins the summary's structural anchors to `skills/poteto-mode/SKILL.md` so the two texts cannot drift silently.

## Considered Options

- A default-on global hook — rejected: Q8 (the user explicitly declined always-on by default).
- The summary inside `skills/poteto-mode/` — rejected: ADR-0002 upstream-subtree discipline.
