# Resident mode is an opt-in SessionStart hook, never default

Upstream keeps Custom Mode on for the whole session (Option+Enter); round 1 settled on per-task `/pstack-poteto-mode` because Q8 rejected any global mode change by default. The resident option keeps Q8 intact by moving the opt-in to the user: the repo ships `scripts/resident/` — a condensed poteto-mode summary, a zero-dependency node inject script, and an idempotent installer with `--remove` — that registers a SessionStart hook in the user-level config. The hook injects roughly 300 tokens into each new session when poteto-mode is installed, and does nothing otherwise; SessionStart injection cannot block or fail a session.

**Addendum (2026-10-17, owner request):** the distribution vehicle changed from `scripts/resident/` to a ZCode plugin, `plugins/pstack-resident/`. The skills CLI cannot carry hooks (the round-2 research's distribution gap), and a plugin can: installing the plugin is the entire opt-in, removing it the entire opt-out, and no config file is touched. The summary, the ~300-token cost, and the anchor lint are unchanged; the lint now pins `plugins/pstack-resident/resident-summary.md`. Q8 still holds — nothing resident ships by default. A post-merge review sharpened the gating: poteto-mode **reachable** means a project-level install in the session's tree *or* a global install under the home directory, the latter probed explicitly so the behavior does not drift with the drive letter (a walk-up from the cwd alone both false-positived inside the home tree and missed other drives).

**Addendum 2 (2026-10-17, same day, owner direction):** the standalone-plugin vehicle above proved incoherent — its payload depends on skills arriving through a different install route. Per ADR-0012 the whole collection now ships as one plugin; the hook lives at the repo root's `hooks/`, its summary at `hooks/resident-summary.md`, and the gate is the plugin's `residentSummary` user setting (default off) instead of any filesystem probe — installing the collection plugin makes the skills session-reachable by definition, so the setting alone decides.

The summary lives outside the upstream subtree (ADR-0002 forbids additions there), so it does not ship with the skills collection — a documented distribution gap. A lint check pins the summary's structural anchors to `skills/poteto-mode/SKILL.md` so the two texts cannot drift silently.

## Considered Options

- A default-on global hook — rejected: Q8 (the user explicitly declined always-on by default).
- The summary inside `skills/poteto-mode/` — rejected: ADR-0002 upstream-subtree discipline.
