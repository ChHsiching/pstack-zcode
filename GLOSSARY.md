# pstack-zcode

pstack — Lauren Tan (@poteto)'s prompt-stack coding workflow, published inside the `cursor/plugins` monorepo — adapted to run on ZCode. This glossary fixes the vocabulary used across skills, docs, and issues in this repo.

## Language

**pstack**:
The upstream workflow plugin: a stack of skills whose entry point (`poteto-mode`) routes each task to a playbook.
_Avoid_: poteto stack, the plugin

**pstack-zcode**:
This repository — the ZCode adaptation of pstack. Not a fork of the whole monorepo: only the pstack subtree is tracked.
_Avoid_: fork, port

**upstream**:
The `cursor/plugins` monorepo; only changes to its `pstack/` subtree are ever merged here.
_Avoid_: origin (that is this repo), cursor repo

**pstack- prefix**:
The mandatory prefix on every adapted skill name (`pstack-tdd`, `pstack-arena`). Lives in SKILL.md frontmatter only; directories keep upstream names.
_Avoid_: pt- prefix, plugin-qualified invocation as a collision workaround

**playbook**:
A routed step-by-step procedure under `skills/poteto-mode/playbooks/` that executes one task type.
_Avoid_: runbook, recipe

**principle**:
One of the 24 `principle-*` skills cited as decision grounds by other skills.
_Avoid_: rule, guideline

**panel**:
A role whose value is a list of models; each entry spawns one reviewer, so the panel reviews in parallel and cross-checks across families.
_Avoid_: ensemble, jury

**role**:
A named slot in pstack's model configuration mapping a class of work (code, judgment, exploration…) to a model choice.
_Avoid_: persona, profile

**inherit-parent**:
The alias meaning "omit the model field so the subagent follows the session model".
_Avoid_: auto

**models file**:
`~/.zcode/pstack/models.md`, the per-user role-to-model table written by `/pstack-setup-pstack` and read by skills at spawn time; absent means every role runs on the session model.
_Avoid_: models rule, `.mdc` rule

**preset**:
An agent file (`~/.zcode/agents/pstack-<role>.md`) written by `/pstack-setup-pstack` only for a role pinned to a model; it carries that model and reasoning level so a plain subagent spawn can run the role on it.
_Avoid_: role agent

**poteto-agent**:
The delegate-wrapper subagent that runs playbooks; it never pins a model — the spawning role decides.
_Avoid_: helper agent

**comment-sicko**:
The read-only comment-review subagent invoked by `/pstack-no-comments`.

**benny**:
The Slack triage-and-reproduce automation pack in `automations/benny/`; dormant until installed as ZCode automations.
_Avoid_: bot, routine (that is Cursor's term)

**dynamic workflow**:
ZCode's mechanism where a runtime-authored TypeScript script orchestrates subagents with typed intermediate results; the adaptation target for orchestrate-style playbooks and panels.
_Avoid_: pipeline, macro

**automation**:
ZCode's scheduled unattended prompt run (the CronCreate family); the adaptation target for benny's triggers.
_Avoid_: routine, cron job

**session context**:
The material ZCode's `ReadSessionContext` tool returns for one `sess_*` session id — persisted conversation retrieved by query, never a file on disk. Only the main thread can call the tool; skills retrieve in the parent and hand subagents the material.
_Avoid_: transcript, agent-transcripts

**session store**:
`~/.zcode/cli/db/db.sqlite`, ZCode's local session database; read-only queries against it are the listing route (by workspace directory, recency, content), fail-closed to asking for explicit ids when absent or schema-drifted.
_Avoid_: transcripts directory, session API

**resident mode**:
The opt-in SessionStart hook that injects a condensed poteto-mode summary into every new session; installed explicitly via script and removable with one command, never part of the default install.
_Avoid_: always-on mode, global mode
