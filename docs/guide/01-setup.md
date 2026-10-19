# Set up pstack

In this page you install the skills, pick which models pstack uses, and run your first task. Setup is one command plus a short conversation.

## Install the skills

In a terminal, run:

```text
npx skills add ChHsiching/pstack-zcode -g -a zcode -y
```

The CLI installs all skills for ZCode. To let runs spawn the two subagents, copy them by hand as the [README](../../README.md#install) shows. Start a new session and the skills load.

In Claude Code, run `/plugin marketplace add cursor/plugins`, then `/plugin install pstack@cursor-plugins`. Claude Code prefixes plugin commands, so each command in this guide takes a `pstack:` prefix there, such as `/pstack:setup-pstack`, which writes its model rule to `~/.claude/rules/pstack-models.md`. The [Claude Code adapter](../harness/claude-code.md) covers the other differences.

## Pick your models

Run:

```text
/pstack-setup-pstack
```

[`/pstack-setup-pstack`](../../skills/setup-pstack/SKILL.md) detects the models you have access to, asks for a reasoning budget, shows you each role (code delegates, judgment, the review panels), and asks what you want. Answer the questions. It writes `~/.zcode/pstack/models.md`, a data file every pstack skill reads at spawn time.

The `large` budget is the default and targets `xhigh` reasoning. `unlimited` targets each pinned model's top level, `max`; a model uses the highest level it supports at or below the target, and a model with no levels keeps its own default. `medium` and `small` lower the reasoning and spend fewer tokens.

You only override what you care about. A role with no line in the file keeps the default, the session model. To restore a default, delete that role's line. A rerun of `/pstack-setup-pstack` keeps any role whose model differs from the default. When a default changes, a line written before the change still pins the old model, so delete those role lines, or delete the file, then run `/pstack-setup-pstack` again.

Set a role to `inherit-parent` and pstack omits the subagent `model` field, so the subagent inherits your session model. It is an alias, not a model slug. For a panel role the value is a list, and one subagent runs per entry, so the list length sets the panel size. Setup also configures `swarm workers`, the default model for every `/pstack-swarm` worker unless a race names a model for each arm.

## Accept the verification offers, or don't

At the end of setup, `/pstack-setup-pstack` looks for a way to prove app behavior in your project, either a `verify-*` skill or an existing harness. If it finds neither, it offers once to generate one with [`/pstack-create-verification-skill`](../../skills/create-verification-skill/SKILL.md).

Say yes and it writes `.zcode/skills/verify-<app>/`, a project-local skill that teaches agents to drive your app the way a user does. It proves the skill works once before handing it over. Say no and setup moves on. You can run `/pstack-create-verification-skill` yourself any time. [Verify and ship](./06-verify-and-ship.md#create-a-project-verification-skill) covers it in depth.

If you're new to pstack, say yes. An agent that can check its own work keeps going until the check passes. An agent that can't hands every result back to you to check by hand. Of everything in this guide, the verification skill pays off the most.

Then setup offers once to generate a formal verification skill with [`/pstack-create-formal-verification-skill`](../../skills/create-formal-verification-skill/SKILL.md), unless the project already has one. Tests check the cases someone thought to write. A formal verification skill checks one key property of your code, such as "a job never runs twice at once", in every case within a stated scope. Say yes when your code has concurrency, retries, a state machine, or a parser, where a bug is costly and tests rarely reach the case that breaks. Otherwise say no, and run it later if that changes. [Verify and ship](./06-verify-and-ship.md#prove-a-property-with-a-formal-verification-skill) covers it.

After setup, start a new chat. Preset agent files apply to new sessions.

## Keep the cost in check

pstack spends extra tokens on subagents and review panels. That's the price of the rigor. To spend fewer:

- Rerun `/pstack-setup-pstack` and pick a smaller reasoning budget or cheaper models. A strong model in the main chat with cheaper, faster models in the code roles is a good split.
- Set a role to `inherit-parent` so it runs on the session's own model.
- Shorten a panel list. Each entry runs one subagent.
- Save `/pstack-poteto-mode` for work that needs rigor. A small, obvious edit doesn't.

## Run your first task

Pick something real but small, and describe it the way you'd describe it to a colleague:

```text
/pstack-poteto-mode add a --json flag to this command. text output stays byte-identical. verify both.
```

Watch the todo list. Its first items are the matched playbook's steps copied in, the Feature playbook for this prompt. If `/pstack-poteto-mode` skips a step, the step stays in the list with `skip: <reason>`, so you can see what it chose not to do.

From here you can type normal follow-ups. Each invocation of `/pstack-poteto-mode` attaches to the task you type it on, so start each new task with it. Within a task, the chat carries the playbook and its todo list, and plain follow-ups keep it moving.

Next: [Route work through `/pstack-poteto-mode`](./02-poteto-mode.md).
