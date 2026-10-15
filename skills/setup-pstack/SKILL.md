---
name: pstack-setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Detects your available models and writes a data file that overrides the defaults. Use for /pstack-setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write `~/.zcode/pstack/models.md`, a data file that sets pstack's model per role. Skills read it at spawn time; with no file, every role runs on the session model.

## Steps

### 1. Detect available models

Enumerate the model ids you can pin for a subagent, as `providerId/modelId`. That is the dependable source: query the model catalog tool first, and record each model's reasoning levels when it lists them. When no catalog is available, read `~/.zcode/v2/model-providers.json` and list every configured provider's models (never quote its API keys). When neither source yields models, ask the user to paste the model ids they have access to. Never write a real model id you have not confirmed is available. The alias `inherit-parent` is always valid even though it is not a detected model.

### 2. Load current state

The default role-to-model mapping is the table shape shown in step 5 below: every role `inherit-parent`. If `~/.zcode/pstack/models.md` already exists, read it and treat its `# budget` line and its role values as the current choices. Otherwise start from those defaults. A line whose role is not in step 5, such as `how critics`, is from a retired role. Drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Prefer AskUserQuestion over free text. Offer these four options with these exact labels, and name the current budget when the file records one. With no file, say that `large` is the default budget.

- `unlimited — max reasoning`
- `large — xhigh reasoning`
- `medium — high reasoning`
- `small — medium reasoning`

**(b) Apply it.** Build the working table from the defaults, and on a re-run keep any role you changed by model, list, or `inherit-parent`. `unlimited`, `large`, `medium`, and `small` set the reasoning level of every pinned model, panel entries included, to `max`, `xhigh`, `high`, or `medium`. Use the highest level the model supports at or below the target; a model with no levels keeps its own default. `inherit-parent` does not change.

**(c) Show the roles and confirm.** Show every role with its model, marking any real model id not in the detected set as needing a choice. Also list each line step 2 dropped. Ask whether to accept as-is or change specific roles, offering the detected models plus `inherit-parent` (the role runs on the session model) as the options. Prefer AskUserQuestion over free text. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, alias entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena selects one value from it whose model's provider differs from the parent's when possible. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every real model id written must be in the detected set. `inherit-parent` always passes. If a chosen model id is not available, stop and ask again.

### 5. Write the file and the presets

Write `~/.zcode/pstack/models.md` with a `# budget` line with the chosen label and its target level, and one line per role, using the same labels poteto-mode uses. Overwrite the whole file so re-runs stay idempotent. Shape:

```
# pstack model configuration. One line per role. Delete a line to fall back to the default (`inherit-parent`).
# `inherit-parent`: the role runs on the session model (omit the model). `providerId/modelId[@<level>]`: the role runs on its preset subagent with that model and reasoning level. Alias entries in a panel list still count toward its fan-out.
# budget: large (thoughtLevel: xhigh)
feature, refactoring: inherit-parent
bug-fix: inherit-parent
perf-issue: inherit-parent
hillclimb: inherit-parent
judgment and prose: inherit-parent
hardest tasks: inherit-parent
how explorer: inherit-parent
how explainer: inherit-parent
why investigators: inherit-parent
why synthesizer: inherit-parent
reflect tooling: inherit-parent
reflect judgment, divergent, synthesizer: inherit-parent
arena runners: inherit-parent
arena cross-judge pool: inherit-parent
swarm workers: inherit-parent
architect runners: inherit-parent
interrogate reviewers: inherit-parent
```

Then generate a preset agent file `~/.zcode/agents/pstack-<role>.md` for every role pinned to a real model except the panel roles, whose lists name models directly. The preset name is `pstack-` plus the role line lowercased, spaces and commas as hyphens (`reflect judgment, divergent, synthesizer` → `pstack-reflect-judgment-divergent-synthesizer`). Give it the model in `model` and, when the model has levels, its level in `thoughtLevel`, and the body of pstack's `agents/poteto-agent.md` verbatim with the preset name in `name`. Delete any preset whose role is no longer pinned. Preset files apply to new sessions.

### 6. Confirm

Tell the user the file was written and that skills read it at spawn time, and that new preset agent files apply to new sessions. Re-running this skill updates both.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /pstack-create-verification-skill." On yes, invoke `/pstack-create-verification-skill` (resolves wherever pstack is installed: workspace, user, or plugin). On no, move on without pushing.
