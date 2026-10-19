# Run work while you sleep

This is the payoff for everything before it. An agent you can trust to verify its own work is an agent you can leave alone with a hard task. What makes that safe isn't hope. It's a checkable finish condition, an isolated worktree, and a decision log you audit in the morning.

![She waves goodnight from the door while robots keep the factory running, one updating a DECISION LOG wall board under a BUILD LOOP ACTIVE sign.](./images/overnight.jpg)

## Earn the trust before the loop

A loop you don't trust just produces unchecked work faster, and the mess compounds with every iteration. Before you leave one running, check that it has earned it:

- You've done the task once by hand, or watched an agent do it, so you know what good looks like.
- The agent has the tools and signals you'd use yourself: the verification skill, the profiler, the logs.
- Every stage proves its work and can stop the line when the work misses the bar.
- You've read a few transcripts and turned the repeated failures into tools, skills, or checks.

Make the loop autonomous only after all four hold. Until then, run it while you watch.

## The overnight contract

A good handoff has the goal, the finish condition, permissions, and an escape hatch. It doesn't need to be long:

```text
/pstack-poteto-mode im going to bed. migrate every caller to the new parser in a fresh worktree off <base>.
done means zero old callers, all parser fixtures pass, old api deleted.
keep a decision log. don't ask me before committing.
keep going until done. if you're truly stuck after a few hours, stop and write up why.
```

Walk through what each line buys you:

- "im going to bed" is a session override. The agent stops asking and keeps going.
- "done means..." turns the goal into checks every iteration can run.
- "fresh worktree off `<base>`" keeps the run from colliding with anything else you have open.
- "don't ask me before committing" pre-answers the permission the agent would otherwise block on.
- "keep going until done" names the wake mechanism. The [Autonomous run playbook](../../skills/poteto-mode/playbooks/autonomous-run.md) picks it: a watcher subagent for an event to watch, or a heartbeat that re-checks the finish condition.
- The escape hatch lets it stop at a genuine dead end and write up why, which beats eight hours of creative goal reinterpretation.

Because you'll review this work after stepping away, `/pstack-poteto-mode` routes it through [`/pstack-figure-it-out`](../../skills/figure-it-out/SKILL.md), which designs the run's phases before any code and wires in the decision log.

To stop a run on purpose, tell the agent to pause, or that you're about to go offline or restart ZCode. The [Pause safely playbook](../../skills/poteto-mode/playbooks/pause-safely.md) finishes or backs out of the current step, commits a work-in-progress checkpoint, and writes a resume note. A fresh chat picks the work up from that note through the Session pickup playbook. Saying "keep going" never triggers a pause.

## What the loop does all night

```mermaid
flowchart TD
    A[Check the finish condition] --> B[Make the smallest justified change]
    B --> C[Verify against the real artifact]
    C --> D{Progress?}
    D -->|Yes| E[Commit]
    D -->|No| F[Discard]
    E --> G[Log one decision row]
    F --> G
    G --> A
```

One change, one check, one log row, every iteration. Changes that didn't help get discarded, not left to ride. A plateau means pivot, not stop, and the finish condition never quietly relaxes to declare victory.

## The morning audit

[`/pstack-show-me-your-work`](../../skills/show-me-your-work/SKILL.md) is what makes the run reviewable. Each row records the time, phase, decision, reason, an evidence pointer, and the result, in a TSV at `decisions.tsv` (or `.audit/<task-slug>.tsv` when several runs share a directory). It stays local by default. Commit it when the work is ambitious enough that a reviewer needs the trail to trust the result.

When you're back, ask for the run in review form:

```text
/pstack-show-me-your-work catch me up on what you did last night
```

Before the skill hands back its summary, it spawns a reviewer on a different model family to read the trail and the transcript, and the reply ends with an Attention section listing what deserves your scrutiny. Read that section first, then the log rows it points at. You're auditing decisions, not re-reading the whole night.

For a quick status instead of an audit, run [`/ketchup`](../../skills/ketchup/SKILL.md) in the chat that ran the work. It reads only, and tells you in plain words what changed since your last message, with the screenshots and small diagrams the work produced. Then it lists each call waiting on you, such as a merge, an approval, or a choice between options, with its pick, the evidence, and the risk, so you can decide from the reply alone.

## When the night holds a queue, not a task

The contract above drives one task to one finish condition. Some nights hold more, a queue of independent changes or a whole program. Three playbooks scale the same trust up.

[Autopilot-full](../../skills/poteto-mode/playbooks/autopilot-full.md) runs a queue of independent PRs to merged. Each PR gets one owner agent that carries it from build through merge, and no owner merges on its own verdict. A swarm of fresh verifiers checks the owner's code-ready head. A later rebase or minor fix gets one fresh verifier, and only new behavior or a large new diff calls the full swarm again. Only a clean verdict on the patch that merges authorizes the merge:

```text
/pstack-poteto-mode full autopilot on this queue. each item is independent. i want them merged by morning.
```

[Autopilot-stack](../../skills/poteto-mode/playbooks/autopilot-stack.md) runs the same owner loop but ships nothing. You wake up to one linear base-branch stack with a verifier's verdict on every link, and you review and land it yourself. Pick it over Autopilot-full when the changes are coupled, or when you want your own eyes on the work before anything merges:

```text
/pstack-poteto-mode autopilot these five changes but stack them, don't ship. i'll land the stack in the morning.
```

[Orchestrate](../../skills/poteto-mode/playbooks/orchestrate.md) is for a program that outlives any single agent: multi-day, many stacked PRs, fleets of subagents under one standing coordinator chat. The coordinator authors briefs, collects what its subagents finish, keeps the lowest unmerged PR green, and never writes code itself. It's deliberately heavy machinery. If one agent could finish the work in a session, the playbook itself routes you back to the overnight contract above:

```text
/pstack-poteto-mode orchestrate the store migration. own it until every package is converted and merged. i'll check in twice a day.
```

## Run many projects in parallel

An [Orchestrate run](../../skills/poteto-mode/playbooks/orchestrate.md) gives one coordinator chat a standing program. The coordinator doesn't write code. It runs as a dynamic workflow that spawns local workers, each in its own worktree, so the program picks up where the last session left it. That's the shape the Orchestrate playbook expects. Start your prompts to the coordinator with `/pstack-poteto-mode`, and the workers it spawns follow the playbooks.

A few habits help:

- Give each body of work its own orchestrate run, such as a feature, a migration, a perf push, or a tech-debt cleanup. Several can run side by side.
- Keep each run's store committed, finished runs included, so the next run reads what they learned.
- Give each PR a verification swarm before it merges, and let Autopilot-stack or Autopilot-full carry the queue.
- Ask the coordinator for a plan backed by data, and have it answer open questions with prototypes before it asks you.

One prompt can carry a whole program, from research through execution:

```text
/pstack-poteto-mode refactor this repo so its architecture is more agent friendly. use /pstack-correct and /pstack-architect on past commits and review comments to find the mistakes agents make most here. use /pstack-recall for context from past sessions. answer open questions with prototypes instead of asking me. come back with a plan backed by real data. once i approve it, run it with autopilot-stack or autopilot-full, and ask me which.
```

## Let loops start themselves

Every loop above still waits for you to start it. A scheduled or event-driven automation removes that step. Software maintenance splits into stages that suit this well: triage a report, reproduce it, fix it, verify the fix. Two rules keep such a line trustworthy:

- Every stage can stop the line. Triage can decide the report is expected behavior, repro can fail to reproduce it, and the fixer can judge the change too risky. Each of those outcomes is useful, because it keeps bad work from reaching the next stage, where it costs more to undo.
- Every stage hands over evidence. Repro attaches screenshots and video of the broken state, and the fix attaches before-and-after proof. A human can then check that the agent fixed the right thing before reading a line of code.

pstack ships this as a dormant [automation pack](../../automations/benny/README.md) for Slack issue reports. One automation triages each report. The other reproduces confirmed bugs and may prepare a small draft fix. Point ZCode at its [`FOR_AGENTS.md`](../../automations/benny/FOR_AGENTS.md) and name the target repository to set it up.

**Pitfall:** a duration is not a finish condition. "work on this for 4 hours" gives the agent nothing to check, and you'll wake up to four hours of motion instead of a result. Give the run a predicate that can pass or fail.

## Long-run recipes

The wake is the part you pick on ZCode. Three mechanisms carry a long run, each with its own clock: match the mechanism to the night, and read its limit before you bet a morning on it.

### Workflow self-loop

The whole night is one dynamic workflow. The loop is TypeScript control flow in the script, so the cap and the exit are code you can read before you leave.

- **Use it when** the task has a checkable finish condition and phases that gate on each other — the autopilot shape. This mechanism carries the `/loop 1h` heartbeat [autopilot-full](../../skills/poteto-mode/playbooks/autopilot-full.md) arms: the plan text keeps the phrase, and the tick it names is the workflow re-looping in script.
- **Cap and wake:** the script declares its round cap and finish predicate (`for (let round = 1; round <= 40; round++)`), so the run ends by finishing or by spending the count — count rounds or tasks, not hours, because the sandbox has no clock. The run works in the background and the completion notification arrives on its own. A restart marks the live run `stopped(interrupted)`, and resuming picks up where it waited with finished steps replayed free. A deterministic provider error marks it `stopped(provider)` until you fix the cause and resume.
- **Limit:** progress needs the app running, and a decision the script cannot make stops the run at a hole or an escalation until the main session answers.

### Stop-hook rounds

One chat, a few extra turns. A `Stop` hook may ask the model to continue (config hooks, `hooks.enabled: true`).

- **Use it when** a watched run keeps trying to stop a few turns early — the verification tail, one more fix round — and re-prompting would cost more than the hook.
- **Cap and wake:** it wakes when the model stops, and continues at most three times.
- **Limit:** three turns of one chat. It stretches the tail of a watched run; a whole night needs one of the other two mechanisms.

### Cron wake

A scheduled automation (`CronCreate`) fires a prompt into the session that created it, on a cron or a minute-level interval, and survives restarts.

- **Use it when** the run must re-check on a schedule while you're away: resume a parked run every hour, re-probe a stuck queue each morning.
- **Cap and wake:** it fires while the machine is awake and the app running; sleep skips the tick, and a missed one-shot lands as skipped — nothing backfills. Turn on Keep awake for the hours a schedule must hold. The machine holds twenty automations at most, so delete one to free its slot.
- **Limit:** the fired turn can neither create nor modify automations, so its prompt resumes work and leaves the re-arming to you.

None of the three is a cloud service. The work runs on this machine, inside the running app, so shape the night for a machine that sleeps. A true around-the-clock executor is a cloud decision this collection has researched and parked — conditionally feasible, the blockers named, the default no build — which leaves the combo below as the honest overnight shape.

### The combo: waves, wakes, and a safe pause

One recipe for a segmented night. The workflow advances the work, the cron wakes the session, and every boundary leaves a checkpoint a cold start can resume from.

1. **Arm the workflow.** Ask for the task as a dynamic workflow by name (a workflow starts only on an explicit ask), its script looping waves under an explicit round cap and exiting on the finish predicate. Done when the confirmation window shows the run and it settles into the background.
2. **Create the wake.** In the same session, `CronCreate` an hourly automation whose prompt is:

   ```text
   one wake tick: check the run. if it is stopped, resume it from where it waited. if the finish condition holds, report done and go idle. otherwise let it work and check again next tick.
   ```

   Done when the automation list shows one entry bound to this session.
3. **Pause safely at every boundary you draw.** When you stop the night on purpose, the [Pause safely playbook](../../skills/poteto-mode/playbooks/pause-safely.md) finishes or backs out the current step, commits one `wip:` checkpoint, and writes the resume note the next wake reads cold. Done when the stop leaves a commit plus a note.
4. **Keep the machine awake** for the hours the schedule must fire. Slept hours skip their ticks; the next fire resumes from the checkpoint.
5. **Audit and disarm in the morning.** `/pstack-show-me-your-work catch me up on the night`, then delete the automation. Done when the list shows nothing for this task and the audit names the finish state.

Next: [Steer with principle names](./08-principles.md).
