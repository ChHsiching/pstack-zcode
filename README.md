# pstack-zcode

pstack-zcode is [pstack](https://x.com/poteto), Lauren @poteto's coding workflow for shipping high quality code with agents, adapted for ZCode. same workflow, different editor: every change to the upstream tree swaps a Cursor mechanism for its ZCode equivalent, skill bodies keep upstream's wording, and upstream changes merge in through `scripts/sync-upstream.sh`.

there's a growing sense that ai writes too much slop code. throughput without quality is not a goal. if you want to go fast, go deep first. pstack helps you write less, but higher quality code. it turns ZCode into a real engineering team.

**pstack gives you fearless parallelism.** when you can go deep on one agent and trust it to write good, verifiable code, you can truly parallelize with confidence. start multiple agents up with `/pstack-poteto-mode` and trust that they'll apply rigorous engineering principles to their work.

**ZCode gives you the best of all worlds.** every frontier model has its strengths and weaknesses. use any model with pstack. panels fan out through ZCode dynamic workflows, each agent pinned to its own model and reasoning level.

fork it. improve it. make it yours. PRs are welcome!

## install

one command, in a terminal:

```bash
npx skills add ChHsiching/pstack-zcode -g -a zcode -y
```

the [skills CLI](https://github.com/vercel-labs/skills) installs all skills into `~/.zcode/skills/` (global scope) and `~/.agents/skills/`. skills load in new ZCode sessions, so start a fresh session after installing. update with `npx skills update -g`, remove with `npx skills remove`.

the two subagents ship outside the collection, and the skills CLI does not install agent files. copy them by hand, one line each:

```bash
mkdir -p ~/.zcode/agents && curl -fsSL https://raw.githubusercontent.com/ChHsiching/pstack-zcode/main/agents/poteto-agent.md -o ~/.zcode/agents/poteto-agent.md
curl -fsSL https://raw.githubusercontent.com/ChHsiching/pstack-zcode/main/agents/comment-sicko.md -o ~/.zcode/agents/comment-sicko.md
```

## differences from cursor pstack

| cursor pstack | pstack-zcode |
|---|---|
| `/add-plugin pstack` installs a plugin | `npx skills add ChHsiching/pstack-zcode` installs the skills collection |
| subagents ship inside the plugin | the two agent files are copied to `~/.zcode/agents/` by hand |
| skills invoke as `/poteto-mode`, `/how`, … | every skill carries a `pstack-` prefix: `/pstack-poteto-mode`, `/pstack-how`, … |
| model roles live in a cursor rule (`~/.cursor/rules/pstack-models.mdc`) | model roles live in a data file (`~/.zcode/pstack/models.md`) read at spawn time; with no file, every role runs on the session model |
| panels spawn through the Task tool with `subagent_type` | panels fan out through dynamic workflows, one agent per entry with its own model and reasoning level |
| orchestrate and autopilot nest subagents three deep | orchestration is workflow topology: the script queues, spawns, and gates; no agent nests |
| a custom mode keeps `/poteto-mode` on across turns | type `/pstack-poteto-mode` at the start of each task |
| cursor's `/loop` re-wakes a run | the playbooks run their own watchers and heartbeats |
| cursor Projects host standing coordinators in the cloud | orchestrate runs one coordinator chat locally over a workflow |
| cloud subagents give each parallel task its own VM | local worktrees give each parallel task its own checkout |
| benny runs 24/7 in cursor's cloud | benny runs on native ZCode scheduled automations, on your machine |

## known limitations

- benny's automations fire only while your machine and ZCode are awake; a firing missed while asleep is skipped, not backfilled.
- there is no persistent mode. `/pstack-poteto-mode` attaches to the task you type it on, so start each task with it.

## get started

two steps:

1. run [`/pstack-setup-pstack`](./skills/setup-pstack/SKILL.md), pick a reasoning budget, and choose which models you want.
2. use [`/pstack-poteto-mode`](./skills/poteto-mode/SKILL.md) whenever you're doing anything that requires rigor.

new here? the [pstack guide](./docs/guide/README.md) walks you through a first real task, from setup and prompting through verification and overnight runs. stuck, or unsure which skill fits? ask [`/pstack-poteto-help`](./skills/poteto-help/SKILL.md).

that's it. the other skills are situational; the mode skill uses them for you as needed. out of the box every role runs on the session model, and the default panel is one seat on it. [`/pstack-setup-pstack`](./skills/setup-pstack/SKILL.md) pins any role to another model.

## usage

use [`/pstack-poteto-mode`](./skills/poteto-mode/SKILL.md) at the start of a task. it reads your request, picks from a set of playbooks, and runs the other skills as the steps need them.

pick `/pstack-poteto-mode` from the `/` menu before you type your task, so ZCode attaches the skill to the message.

### just use [`/pstack-poteto-mode`](./skills/poteto-mode/SKILL.md)

this skill is the main shortcut. i use it whenever i need the agent to do rigorous engineering work. it comes with twenty-three playbooks:

```
/pstack-poteto-mode this pr has a subtle bug where the scroll drifts every 750ms even when idle. repro
first, then fix and verify.
```

```
/pstack-poteto-mode i'm going to bed. land the stack even if ci flakes. i want everything merged by
morning.
```

<details>
<summary>the twenty-three playbooks</summary>

| playbook | for |
|---|---|
| [investigation](./skills/poteto-mode/playbooks/investigation.md) | a read-only question. how does x work, why was y built this way, are we sure. |
| [bug fix](./skills/poteto-mode/playbooks/bug-fix.md) | reproduce a defect, root-cause it, and fix with runtime evidence. |
| [perf](./skills/poteto-mode/playbooks/perf-issue.md) | trace a measured slowness and improve it against a baseline. |
| [hillclimb](./skills/poteto-mode/playbooks/hillclimb.md) | sustained, scientific improvement of one metric against a target, looping hypotheses with before/after measurement and one commit per accepted win. |
| [runtime forensics](./skills/poteto-mode/playbooks/runtime-forensics.md) | diagnose a live symptom (leak, idle-cpu spin, glitch) from instrumentation. |
| [trace forensics](./skills/poteto-mode/playbooks/trace-forensics.md) | diagnose a captured profiling artifact (cpuprofile, trace, spindump, heap snapshot). |
| [feature](./skills/poteto-mode/playbooks/feature.md) | new or changed behavior, built from a named data shape. |
| [refactoring](./skills/poteto-mode/playbooks/refactoring.md) | a behavior-preserving change to structure or shape. |
| [prototype](./skills/poteto-mode/playbooks/prototype.md) | a throwaway sketch to make a design or behavioral decision cheaply, or to settle an empirical fork by observing it. |
| [visual parity](./skills/poteto-mode/playbooks/visual-parity.md) | pixel-exact ui equivalence between two implementations. |
| [authoring a skill](./skills/poteto-mode/playbooks/authoring-a-skill.md) | writing or editing a SKILL.md. |
| [eval](./skills/poteto-mode/playbooks/eval.md) | test how a skill or prompt change affects agent behavior, blinded. |
| [babysit](./skills/poteto-mode/playbooks/babysit.md) | drive a pr or a stack to merge-ready: conflicts, review threads, ci. |
| [shipping](./skills/poteto-mode/playbooks/shipping.md) | independently verify a green stack, then land the contiguous verified run bottom-up through github by default or origin when available. |
| [autonomous run](./skills/poteto-mode/playbooks/autonomous-run.md) | drive a long task to completion without stopping. |
| [orchestrate](./skills/poteto-mode/playbooks/orchestrate.md) | a standing project handed to one coordinator chat: multi-day, many stacked prs, fleets of subagents. |
| [autopilot-full](./skills/poteto-mode/playbooks/autopilot-full.md) | run independent prs to merged with one owner per pr and a root swarm verdict on each round, from the code-ready head on. |
| [autopilot-stack](./skills/poteto-mode/playbooks/autopilot-stack.md) | build and verify one linear base-branch stack for the operator to review and land. |
| [session pickup](./skills/poteto-mode/playbooks/session-pickup.md) | resume or take over a prior agent's in-flight work. |
| [pause safely](./skills/poteto-mode/playbooks/pause-safely.md) | suspend in-flight work cleanly so it can be resumed later. |
| [multi-phase plan](./skills/poteto-mode/playbooks/multi-phase-plan.md) | work that spans phases or stacked PRs. |
| [worktree cleanup](./skills/poteto-mode/playbooks/worktree-cleanup.md) | reclaim disk by pruning merged or abandoned worktrees and stale ios simulators, safety-gated. |
| [opening a pr](./skills/poteto-mode/playbooks/opening-a-pr.md) | open a ready pr from small ordered commits with a conventional commits title and a briefing-style body. invoked at the end of every other playbook. |

</details>



when invoked it:

1. matches your task to a [playbook](./skills/poteto-mode/playbooks/) and opens a todo list whose first items are its steps, copied in verbatim.
2. routes to the other skills as the steps fire.
3. writes unslopped replies framed for the consumer and the maintainer.

the full rules and playbooks live in [`skills/poteto-mode/SKILL.md`](./skills/poteto-mode/SKILL.md).

to keep the rigor running across a long task, start follow-up work with `/pstack-poteto-mode` again and reference the open todo list. each invocation applies itself when a playbook matches or the task needs rigor, and stays out of the way otherwise.

## skills

[`/pstack-poteto-mode`](./skills/poteto-mode/SKILL.md) runs most of these for you when a step needs them (`pstack-how`, `pstack-why`, `pstack-architect`, `pstack-arena`, `pstack-swarm`, `pstack-interrogate`, `pstack-unslop`, `pstack-no-comments`, `pstack-technical-writing`, `pstack-tdd`, and the principles). the table below is for when you want one directly:

```
/pstack-how do we cancel runs? do we have an n+1 when we look up every run to cancel?
```

```
/pstack-interrogate review this pr.
```

<details>
<summary>all skills</summary>

| skill | use it when |
|---|---|
| [`/pstack-poteto-mode`](./skills/poteto-mode/SKILL.md) | default entry point for any non-trivial task. |
| [`/pstack-poteto-help`](./skills/poteto-help/SKILL.md) | you're new to pstack, or unsure which skill, playbook, or principle fits. finds out what you're trying to do, answers that part, and hands you a prompt to type. runs only when you type `/pstack-poteto-help`. |
| [`/pstack-in-your-own-words`](./skills/in-your-own-words/SKILL.md) | you want the agent to play back your goal and the problem before it starts. runs only when you type `/pstack-in-your-own-words`. |
| [`/pstack-sharpen`](./skills/sharpen/SKILL.md) | you want a task approached the way a top expert would, aimed at what you're really after, without overspecifying it or deciding your choices for you. |
| [`/pstack-how`](./skills/how/SKILL.md) | you want a walkthrough of how a subsystem works. |
| [`/pstack-why`](./skills/why/SKILL.md) | you want to know why something was built this way. discovers available MCPs at run time and queries each evidence category in parallel (source control, issue tracker, long-form docs, real-time chat, infra observability, error tracking, analytics warehouse). |
| [`/pstack-recall`](./skills/recall/SKILL.md) | you're starting or resuming work and want your recent context on a topic rebuilt from your own session history and the shared record, handed back as a tight current-state brief. |
| [`/pstack-ketchup`](./skills/ketchup/SKILL.md) | you want what changed in this chat since your last message, in a few plain sentences and small visuals, with just enough context on each action item to make the call. |
| [`/pstack-blast-radius`](./skills/blast-radius/SKILL.md) | you have a small-looking change and want to know what else it could break, with the one fact it's safe because of proven by running code, not asserted. |
| [`/pstack-architect`](./skills/architect/SKILL.md) | you're about to write code that crosses a function boundary and want the caller's usage, types, and module shape settled first. |
| [`/pstack-arena`](./skills/arena/SKILL.md) | you want N parallel attempts at the same thing, then to grab the best parts of each. |
| [`/pstack-swarm`](./skills/swarm/SKILL.md) | you want N parallel workers across different slices or races, then one aggregated report. |
| [`/pstack-interrogate`](./skills/interrogate/SKILL.md) | you have a diff and want different models to try to break it, including a strict code-quality lens. |
| [`/pstack-automate-me`](./skills/automate-me/SKILL.md) | you want your own `-mode` skill, drafted from how you've actually worked. |
| [`/pstack-make-bot-ui`](./skills/make-bot-ui/SKILL.md) | you want a page or dashboard whose buttons wake a Grok Bot over a webhook, including the sender-key handoff and Tailscale. |
| [`/pstack-setup-pstack`](./skills/setup-pstack/SKILL.md) | you want to pick which models pstack uses per role. detects your models and writes a data file. |
| [`/pstack-reflect`](./skills/reflect/SKILL.md) | a long task landed and you want the recipe captured as a skill edit. |
| [`/pstack-correct`](./skills/correct/SKILL.md) | you keep correcting agents for the same mistakes. mines history for mistake classes, fixes each at the highest level that works (architecture, then types, lint, and ci, then tests, with docs last), and keeps a table pairing each rule with what enforces it. |
| [`/pstack-teach`](./skills/teach/SKILL.md) | you want to actually understand a change or subsystem, not just have it summarized. runs how + why and weaves one plain explanation, built up diagram by diagram. |
| [`/pstack-tdd`](./skills/tdd/SKILL.md) | you're fixing a bug and there's a cheap local test path. write the failing test first, then the fix. |
| [`/pstack-benchmark-checklist`](./skills/benchmark-checklist/SKILL.md) | you ran a benchmark or measured a speedup or regression. vets the number (limiter, tuning, errors, repeat runs, end-to-end relevance) before you report or act on it. |
| [`/pstack-no-comments`](./skills/no-comments/SKILL.md) | strip comments before review; spawns Comment Sicko, fixes accepted findings, offers encodings for claimed constraints. |
| [`/pstack-typescript-best-practices`](./skills/typescript-best-practices/SKILL.md) | you're reading or editing typescript. grounds the type-system-discipline principle in syntax. |
| [`/pstack-figure-it-out`](./skills/figure-it-out/SKILL.md) | no bundled playbook fits. designs a rigorous, auditable playbook for the task. |
| [`/pstack-show-me-your-work`](./skills/show-me-your-work/SKILL.md) | you want a reviewable decision trail. logs decisions to a tsv you can commit. |
| [`/pstack-create-verification-skill`](./skills/create-verification-skill/SKILL.md) | your project has no scripted way to prove app behavior. generates a project-local verify skill with a feature map, for any language or platform. |
| [`/pstack-maintain-verification-skill`](./skills/maintain-verification-skill/SKILL.md) | your verify skill's feature map has drifted from the app. source wave + one live pass, at most one PR of proven corrections. |
| [`/pstack-unslop`](./skills/unslop/SKILL.md) | you're cleaning up writing. removes AI tells. |
| [`/pstack-bro`](./skills/bro/SKILL.md) | you want the last message restated in plain human language, no jargon. |
| [`/pstack-technical-writing`](./skills/technical-writing/SKILL.md) | layered doc standard (Diátaxis + Google developer style + STE + Global English) for docs, RFCs, readmes, PR descriptions, commit messages. |

</details>



### examples

mostly i type [`/pstack-poteto-mode`](./skills/poteto-mode/SKILL.md) at the start of a task and let it route to a playbook. the other skills fire as the steps need them. a few i reach for directly.


<details>
<summary>all the examples</summary>

```
bug fix:           /pstack-poteto-mode this pr has a subtle bug where the scroll drifts every 750ms even
                   when idle. repro first, then fix and verify.
perf:              /pstack-poteto-mode a big list takes a second or two to load even though we virtualize.
                   run a cpu trace and tell me why.
feature:           /pstack-poteto-mode build a small feature behind a feature flag. verify it really works.
prototype:         /pstack-poteto-mode build two prototypes of the markdown renderer so we can compare.
                   spawn an agent for each.
multi-phase:       /pstack-poteto-mode open source these skills as a collection. nothing internal leaks, work
                   in a temp dir, show me the dependency graph first.
overnight run:     /pstack-poteto-mode i'm going to bed. land the stack even if ci flakes. i want
                   everything merged by morning.
babysit:           /pstack-poteto-mode check on pr 123. anything outstanding?
visual parity:     /pstack-poteto-mode the row spacing is too tall when this flag is on. the second image
                   is correct. repro and fix until it matches.
figure it out:     /pstack-poteto-mode i'm stepping away. migrate every caller from the synchronous store
                   to the new async one, keeping behavior identical. i want to trust it was done
                   right when i'm back.
how:               /pstack-how do we cancel runs? do we have an n+1 when we look up every run to cancel?
why:               /pstack-why is this feature flag not on yet?
architect:         design this instrumentation to be high signal with no false positives. /pstack-architect
                   this first.
arena:             /pstack-arena take my prompt to the arena verbatim. i want to compare their proposals
                   with yours.
swarm:             /pstack-swarm check every package under packages/ against its check.sh. one worker per
                   package. one report.
interrogate:       /pstack-interrogate review this pr.
tdd:               /pstack-tdd implement
unslop:            can we unslop and tighten the new changes?
reflect:           /pstack-reflect that took too long. capture what we learned so the next run doesn't
                   repeat it.
correct:           /pstack-correct
show-me-your-work: /pstack-show-me-your-work keep a decision trail i can review when i'm back.
automate-me:       /pstack-automate-me
help:              /pstack-poteto-help which skill should i use to review this branch?
```

</details>

## the `poteto-agent` and Comment Sicko subagents

[`/pstack-poteto-mode`](./skills/poteto-mode/SKILL.md) runs in the chat that receives it. that chat owns the playbook, the todo list, and every subagent spawn.

pstack also ships [`poteto-agent`](./agents/poteto-agent.md) as the wrapper for delegates spawned during a run; install it in `~/.zcode/agents/` as [install](#install) shows. it reads `pstack-poteto-mode` in full, including its inline principles index, before doing any work. substituting `general-purpose` skips that read and drifts. do not spawn `poteto-agent` to run the playbook itself.

[`/pstack-poteto-mode`](./skills/poteto-mode/SKILL.md) and `poteto-agent` route through the same wrapper.

pstack also ships [Comment Sicko](./agents/comment-sicko.md), a read-only comment reviewer spawned by name. usually invoke it through [`/pstack-no-comments`](./skills/no-comments/SKILL.md), not directly.

## principles

twenty-four short skills, one principle each. `pstack-poteto-mode` indexes them inline and reads that index at task start. the standalone files are there so other skills can reference a principle by name, and so the index can point at the full rule for each.

<details>
<summary>all twenty-four principles</summary>

| principle | group | rule |
|---|---|---|
| [laziness-protocol](./skills/principle-laziness-protocol/SKILL.md) | core | Bias toward deletion and the smallest change that solves the problem. |
| [foundational-thinking](./skills/principle-foundational-thinking/SKILL.md) | core | Apply before writing logic: choosing core types and data structures, sequencing scaffold-vs-feature work, asking what concurrent actors share. Get the data structures right so downstream code becomes obvious. |
| [redesign-from-first-principles](./skills/principle-redesign-from-first-principles/SKILL.md) | core | Redesign as if the requirement had been a foundational assumption from day one, instead of bolting it on. |
| [attack-the-premise](./skills/principle-attack-the-premise/SKILL.md) | core | Apply when two or more fixes that share one premise have failed the same gate. Take a census of which actors hold the imbalance before the next fix, then question the premise instead of writing another fix that assumes it. |
| [subtract-before-you-add](./skills/principle-subtract-before-you-add/SKILL.md) | core | Remove dead weight, redundant validators, and stub references first, then build on the simpler base. |
| [minimize-reader-load](./skills/principle-minimize-reader-load/SKILL.md) | core | Count layers between question and answer, and hidden state in the reader's head; collapse one-caller wrappers and shrink mutable scope. |
| [outcome-oriented-execution](./skills/principle-outcome-oriented-execution/SKILL.md) | core | Apply during planned rewrites and migrations with explicit phase boundaries. Converge on the target architecture; don't preserve smooth intermediate states with throwaway compatibility code. |
| [experience-first](./skills/principle-experience-first/SKILL.md) | core | Choose user delight over implementation convenience; ship fewer polished features over more rough ones. |
| [exhaust-the-design-space](./skills/principle-exhaust-the-design-space/SKILL.md) | core | Build 2-3 competing prototypes and compare side by side before committing. |
| [build-the-lever](./skills/principle-build-the-lever/SKILL.md) | core | Apply to any non-trivial work, not just bulk work: edits, migrations, analyses, checks. Build the tool that does it or proves it (codemod, script, generator, or a skill your subagents follow) instead of working by hand. The tool is the artifact a reviewer can rerun. |
| [model-the-domain](./skills/principle-model-the-domain/SKILL.md) | architecture | Encode the domain in a structure instead of scattered conditionals. |
| [boundary-discipline](./skills/principle-boundary-discipline/SKILL.md) | architecture | Concentrate guards at system boundaries (CLI, config, network, external APIs); trust internal types and keep business logic in pure functions. |
| [type-system-discipline](./skills/principle-type-system-discipline/SKILL.md) | architecture | Make illegal states unrepresentable, brand semantic primitives, parse external data at boundaries, refuse to lie to the compiler, exhaust variants, derive from authoritative schemas. |
| [make-operations-idempotent](./skills/principle-make-operations-idempotent/SKILL.md) | architecture | Converge to the same end state regardless of partial prior runs. |
| [migrate-callers-then-delete-legacy-apis](./skills/principle-migrate-callers-then-delete-legacy-apis/SKILL.md) | architecture | Migrate callers and delete the old API in the same wave instead of preserving compatibility layers. |
| [separate-before-serializing-shared-state](./skills/principle-separate-before-serializing-shared-state/SKILL.md) | architecture | Eliminate the sharing first; serialize structurally only when one shared writer is a real invariant. |
| [prove-it-works](./skills/principle-prove-it-works/SKILL.md) | verification | Apply after completing a task, before declaring done. Verify against the real artifact (run the feature, read the actual value, inspect the diff), not a proxy, self-report, or 'it compiles.'. |
| [fix-root-causes](./skills/principle-fix-root-causes/SKILL.md) | verification | Trace each symptom to its root cause and fix it there; reproduce first, ask why until you reach it, resist nil-check guards that silence crashes. |
| [sequence-verifiable-units](./skills/principle-sequence-verifiable-units/SKILL.md) | verification | Apply to multi-step work (sweeps, migrations, runs of similar edits) and to how you stack commits and PRs. Break work into small units that each end in a verifiable state, check each before the next, and order delivery so the sequence proves itself to a reviewer. |
| [test-behavior-not-implementation](./skills/principle-test-behavior-not-implementation/SKILL.md) | verification | Apply when you write, change, or keep a test. Call the code the way its users do and assert the result they observe against a literal expected value. If the test would still pass when every imported function returns undefined, rewrite the assertion or delete the test. |
| [explain-the-number](./skills/principle-explain-the-number/SKILL.md) | verification | Apply before you trust, report, or act on a number you measured: a speedup, a regression, a throughput, a latency, or an eval result. Find what limits it, and rule out that it measured something other than the work you think. |
| [guard-the-context-window](./skills/principle-guard-the-context-window/SKILL.md) | delegation | Route bulk to subagents; keep summaries in the main thread, not raw payloads. |
| [never-block-on-the-human](./skills/principle-never-block-on-the-human/SKILL.md) | delegation | Proceed, present the result, let the human course-correct after the fact; reserve confirmation for irreversible actions. |
| [encode-lessons-in-structure](./skills/principle-encode-lessons-in-structure/SKILL.md) | meta | Encode the rule as a lint, metadata flag, runtime check, or script instead of more text. |

</details>

## not shipped here

a few things `pstack-poteto-mode` references but doesn't bundle:

- a browser-driving skill for UI verification ships as a ZCode plugin (playwright or chrome-devtools). install one alongside pstack if your work touches browser, Electron, or web UIs.

## why are there no planning skills?

ZCode already has a great plan mode which works great with pstack. but personally, i don't believe in planning. the best spec is code. if you do want to make a plan, [`/pstack-poteto-mode`](./skills/poteto-mode/SKILL.md) covers it, but it's not a default.

## make it yours

`pstack-poteto-mode` is one person's style. you may not want exactly that.

type [`/pstack-automate-me`](./skills/automate-me/SKILL.md). it mines your recent sessions, drafts a `<your-name>-mode` skill from how you've actually worked, and routes through pstack underneath. you keep pstack as the base and end up with your own routing skill alongside `pstack-poteto-mode`.

models are configurable too. type [`/pstack-setup-pstack`](./skills/setup-pstack/SKILL.md). it detects the models you have access to and writes a small data file (`~/.zcode/pstack/models.md`) mapping each role (code, judgment, the review panels) to a model. every skill reads it at spawn time and falls back to sensible defaults when the file is absent, so you override only what you want.

when a default changes, a role line written before the change still pins the old model. delete those role lines, or delete the file, then run `/pstack-setup-pstack` again. a rerun keeps any role whose model differs from the default.

## automations

pstack also ships a dormant [benny automation pack](./automations/benny/). benny triages slack issue reports, then reproduces and fixes confirmed bugs with real ui evidence. its files are not registered as slash skills.

to set it up, point ZCode at [`FOR_AGENTS.md`](./automations/benny/FOR_AGENTS.md) and name the target repository. setup merges the pack into the target at `.zcode/automations/benny/`, installs pstack's shared skills there, and keeps user configuration outside the copied pack.

## license

MIT
