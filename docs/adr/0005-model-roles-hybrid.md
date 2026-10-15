# Model roles: default inherit-parent, panels via dynamic workflows, presets on demand

pstack's role→model table (17 roles; written by `/pstack-setup-pstack`, read at spawn time) maps to ZCode as a hybrid: every role defaults to `inherit-parent` (omit the model field — ZCode subagents then follow the session model, verified semantics); panel roles (arena runners, interrogate reviewers, …) fan out through dynamic workflows, where each `agent()` may pin its own model and reasoning level; `/pstack-setup-pstack` regenerates preset agent files (`~/.zcode/agents/pstack-<role>.md`) only for roles the user pins to a specific model.

The plain Agent tool has no per-spawn model override, so scalar-role differentiation outside workflows is only expressible through preset agents — hence on-demand presets instead of a full set.

## Considered Options

- Preset agent per role (17 files) — rejected: panels and ±1-notch effort adjustment are clumsy; changes need a new session.
- Role table in `~/.zcode/AGENTS.md` — rejected: token cost injected into every session and subagent.
