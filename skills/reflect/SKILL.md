---
name: pstack-reflect
description: Spawn three parallel review subagents over the session material, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

Invoke when the user says "reflect" or "/pstack-reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## 1. Assemble the session material

Before fanning out, reduce this conversation — user prompts, decisions, corrections, and the tool calls that shaped the work — to a tight digest. You hold the conversation; subagents cannot read session history, so the digest you pass is all they see.

## 2. Spawn three reviewers in parallel

One message, three subagent spawns, full tool access. Reviewers need MCP access to look up the tickets, chat threads, and observability traces the session material references, and read-only strips MCPs.

Each reviewer and the synthesizer name a role line in `~/.zcode/pstack/models.md`. A line pinning a model runs on its preset subagent, `pstack-<role>` (written by `/pstack-setup-pstack`); spawn the preset by name. An `inherit-parent` or missing line leaves the model unset, so the subagent follows the session model. If a spawn rejects a pinned model, leave the model unset and say so.

| Lens | Role line | Default `model` | Prompt template |
|---|---|---|---|
| Judgment | `reflect judgment, divergent, synthesizer` | `inherit-parent` | `references/judgment-reviewer.md` |
| Tooling | `reflect tooling` | `inherit-parent` | `references/tooling-reviewer.md` |
| Divergent | `reflect judgment, divergent, synthesizer` | `inherit-parent` | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the session digest where marked. Reviewers return findings in their response body.

## 3. Synthesize

One subagent spawn, `model` from the `reflect judgment, divergent, synthesizer` line (default `inherit-parent`), full tool access. It spot-verifies citations through MCP, and read-only strips MCPs. Pass `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. It returns an Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. See the **encode-lessons-in-structure** principle skill.

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

File each Backlog item to your team's devex or backlog tracker without waiting. Only the Accepted list waits for approval.

Never edit a skill under `plugins/cache/`. Before approval, show its destination, `.zcode/skills/<skill>/` or `~/.zcode/skills/<skill>/`. After approval, copy the skill folder there and edit the copy. Never open a PR or push.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the parent does it directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): hand to a subagent running the **Authoring or modifying a skill** playbook and its draft / test / iterate loop.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): tune the skill's `description` frontmatter so it fires next time.
- `new skill: <kebab-name>`: author it per the **Authoring or modifying a skill** playbook (`../poteto-mode/playbooks/authoring-a-skill.md`). Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
