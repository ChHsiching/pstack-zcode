---
name: pstack-swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /pstack-swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

Fan out N parallel workers. They may cover separate slices, race the same brief, or mix both. The parent waits, aggregates, and returns one report.

## Start

Open a todolist with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Set N from the user or derive it from the shape. N is total workers.
4. Pick the worker model from the `swarm workers` line in `~/.zcode/pstack/models.md`. If the file or that line is missing, use `inherit-parent`. For `inherit-parent`, omit `model` so the workers run on the parent model. If a configured model fails validation against the model catalog, use the session model and say so. For a model race, name each arm's model up front.
5. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

The swarm fans out through a dynamic workflow: one worker subagent per brief, each on the step 4 model with its entry's reasoning level, its arm's model in a model race, `model` omitted for `inherit-parent` so those workers run on the session model.

Load the `dynamic-workflows` skill, generate the workflow and save it once (`pstack-swarm`, global scope), and re-run it by name on later runs, passing the model table and the briefs as workflow arguments so each run approves arguments against the saved script; regenerate and re-save when the configured models change.

When a worker must start from a non-default pushed branch, name the branch in its brief.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

Keep a compact result table, one-line evidenced issues, and explicit gaps or dropouts.

## Phase D: Report

Return one consolidated in-chat report with the table, issue one-liners, gaps or dropouts, and the race rule when used.
