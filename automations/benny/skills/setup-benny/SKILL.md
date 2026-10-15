---
name: setup-benny
description: Configure Benny and prepare its triage and repro automations. Use when installing Benny or changing its Slack, tracker, repository, routing, control, model, or budget settings.
disable-model-invocation: true
---

# Set up Benny

Benny ships as a dormant automation pack inside pstack. The skills collection exposes only pstack's normal skills root; this file and the two operational files are not slash skills.

The human enters setup by pointing ZCode at the pack's `FOR_AGENTS.md`. The bootstrap flow copies the whole pack into the target repository, then reads this file directly at `.zcode/automations/benny/skills/setup-benny/SKILL.md`.

Benny needs external configuration and two live ZCode automations.

Do not create or update an automation until the user explicitly asks. Never put a secret value in skill files, prompts, or committed configuration.

## 1. Copy the pack and install the shared pstack skills

Do this before asking for Benny configuration and before creating either automation.

Ask which repository will run the automations. The source pack is the directory containing `FOR_AGENTS.md`. The destination is `<target-repository>/.zcode/automations/benny/`.

Merge the entire source pack into the destination:

1. Create the destination when it is absent.
2. Copy every source file to the same relative path.
3. Preserve destination-only files. Never delete unrelated files during install or refresh.
4. Keep user-owned configuration, feature maps, and routing maps outside the destination. Never overwrite them.
5. When an existing source-managed file differs, inspect the diff and merge without discarding local edits. If ownership is ambiguous, stop and ask before replacing it.
6. Verify that the destination contains `FOR_AGENTS.md`, this setup file, both operational files, their references, and the templates.

If this file is already being read from the target destination, treat the copy as complete and run the same verification before continuing.

Install pstack's shared skills into the target repository by running `npx skills add ChHsiching/pstack-zcode` there and choosing the workspace scope, so they land under `<target-repository>/.zcode/skills/`. Never copy pack files there.

Reload the target workspace or start a fresh agent rooted there. Verify that these shared pstack skills resolve from workspace scope:

- `pstack-how`
- `pstack-why`
- `pstack-tdd`
- `pstack-unslop`
- `pstack-principle-separate-before-serializing-shared-state`
- `pstack-principle-minimize-reader-load`
- `pstack-principle-guard-the-context-window`
- `pstack-principle-sequence-verifiable-units`
- `pstack-principle-fix-root-causes`
- `pstack-principle-prove-it-works`

Do not count a skill loaded from the current session or a user-scoped install. The check must show that a fresh agent in the target repository receives pstack through workspace skills.

If workspace-scoped skill installation is unavailable or any shared dependency does not resolve, stop and explain the failure.

The Benny files are read directly from `.zcode/automations/benny/`. Do not add that directory to a skills root or expect its `SKILL.md` files to appear in the slash-skill list.

Tell the user that `.zcode/skills/`, `.zcode/automations/benny/`, and any referenced secret-free configuration must be committed before either automation is enabled. Do not commit them unless the user asks.

Once this check passes, live automation prompts may read the committed operational files by their stable repository-relative paths. They must not embed a plugin cache path or copy the file contents.

## 2. Adapt the configuration

Open these copied examples:

- `../../templates/configuration.example.yaml`
- `../reproduce-and-fix-issues/references/feature-map.example.md`

Create user-owned copies outside `.zcode/automations/benny/`. These are configuration files, not pack files. Example locations:

- Project config, such as `.zcode/benny/configuration.yaml`
- Project feature map, such as `.zcode/benny/feature-map.md`
- Project routing map, such as `.zcode/benny/routing.md`
- User config, such as `~/.config/benny/configuration.yaml`
- User feature map, such as `~/.config/benny/feature-map.md`

Fill one feature-map section for every user-facing feature the automation may reproduce. Keep it at the user point of view. Do not freeze implementation details or current code paths in the map.

Do not edit the copied examples. Pack refreshes may update source-managed files after conflict review, but they must never touch the user-owned copies.

Prefer committed, secret-free files in the target repository when a fresh automation run must read them. Otherwise paraphrase the required values into the live prompt. Reference a repository file only after confirming that the file is committed in the repository where the automation runs.

Use stable repository-relative paths for committed pack and configuration files. Never reference the plugin source directory or a plugin cache path from a live automation.

## 3. Fill the required choices

Ask for or confirm:

- Source Slack channel ID
- Optional operations or status channel ID
- Repository URL and default branch
- Triage identity or Slack user ID
- Issue tracker type, team, project, labels, and intake status
- Tracker adapter (`gh` CLI for GitHub Issues, or MCP actions)
- Automation schedule interval in minutes
- Optional routing map path
- Required control skill name
- Required user-facing feature-map path
- Status emoji strings
- Pull request URL format
- Polling and effort budgets
- Model slug for triage, repro, code work, and media review

Use only model slugs shown as available in the user's model catalog or supported model list. Do not guess a slug and do not carry over a private default.

The source channel, triage identity, repository, tracker adapter, control skill, feature map, and schedule must be explicit. Fail setup if any required value stays ambiguous.

Use pstack's `pstack-unslop` skill on the final automation names, descriptions, and prompt shims before saving them.

## 4. Check integration capabilities

The triage automation needs:

- Read access to the configured source Slack channel and its threads through the configured Slack MCP server
- Thread-reply access in that channel
- Attachment metadata and file download access when reports include media
- Search, read, create, and update access through the configured issue-tracker adapter

The repro automation needs:

- Read access to the source thread through the configured Slack MCP server
- Thread-reply access in the source channel
- Optional post and edit access in the configured operations channel
- Repository read and history access
- A pull request action that can open a draft pull request
- The configured control-adapter skill

Use the configured Slack MCP server for reads and posts. The optional `BENNY_SLACK_BOT_TOKEN` may fill a narrow gap such as editing one operations status message or downloading an attachment. Store the value in a secret manager or environment, not in YAML.

Do not use undocumented integration endpoints.

## 5. Prepare the routing map

If the user wants reroutes or owner pings:

1. Copy `../triage-issue-reports/references/routing.example.md` outside `.zcode/automations/benny/`.
2. Replace every placeholder with public or organization-local values.
3. Keep owner pings off by default.
4. Allow a ping only for a configured feature owner or a confirmed likely regression author.

If no routing map is configured, triage may classify a report but must not guess a destination or owner.

## 6. Verify the control adapter

Read `../reproduce-and-fix-issues/references/control-adapter.md` and the user's completed feature map.

For a web app, the browser-use plugin's browser skills satisfy this contract; name one of them as the control skill.

Confirm that the named skill can:

- Bring up the target app
- Navigate every mapped feature through the real UI
- Exercise mapped states through declared adapter actions
- Inspect state without forcing the result
- Capture screenshots
- Start and stop a recording
- Clean up its processes and temporary data

If any capability is missing, leave the repro automation disabled. It must fail closed rather than claim a reproduction it did not perform.

## 7. Prepare the live automations

Ask whether this is first-time creation or configuration of existing automations.

Read `../../FOR_AGENTS.md` from the copied pack as the primary user-intent source for either path. Use it to understand the two schedules, tools, instructions, outcomes, and shared rules.

### Install the thread guard

Before creating either automation, merge a PreToolUse hook into the target repository's `.zcode/config.json` so a source-channel root post is denied mechanically, not just by prompt. Derive the matcher from the configured Slack MCP server name (`slack` below):

```json
{
	"hooks": {
		"enabled": true,
		"events": {
			"PreToolUse": [
				{
					"matcher": "^mcp__slack__",
					"hooks": [
						{
							"type": "process",
							"command": "node",
							"args": [
								"${ZCODE_PROJECT_DIR}/.zcode/automations/benny/hooks/enforce-thread-posts.js",
								"<SOURCE_CHANNEL_ID>"
							],
							"timeoutMs": 5000
						}
					]
				}
			]
		}
	}
}
```

Preserve every unrelated setting. The hook script ships with the pack at `.zcode/automations/benny/hooks/enforce-thread-posts.js`; pass the configured source channel ID as its argument. With no source channel argument the hook denies every root post.

### First-time creation

Create one automation at a time.

Both automations recur on the configured cadence from `automations.schedule_interval_minutes`: `recurring` true, `intervalUnit` `minute`, `interval` set to the configured value, and the compatible cron expression `* * * * *`. They fire only while ZCode runs; missed firings are skipped, not backfilled.

For each automation:

1. Read the matching copied prompt template as secondary internal source material.
2. Turn `FOR_AGENTS.md`, the finished Benny configuration, and the template intent into a complete prompt.
3. Tell the live prompt to read and follow its exact committed operational file under `.zcode/automations/benny/`.
4. Use the stable repository-relative path, not a source or cache path. Do not copy the operational file contents into the live prompt.
5. Show the user the complete `CronCreate` arguments: title, schedule, and prompt. Obtain approval before creating.
6. Create the automation with the `CronCreate` tool in this session.
7. Verify the created automation with `CronList`: title, schedule, prompt, and enabled state.
8. Finish this automation before starting the next one.

Give `CronCreate` this complete triage intent, filled from configuration:

- Name `benny-triage`.
- Read and follow `.zcode/automations/benny/skills/triage-issue-reports/SKILL.md` for every run.
- Fire on the configured schedule and scan for new top-level reports in the configured source Slack channel through the configured Slack MCP server.
- Read the triggering thread and reply only inside it.
- Use the configured issue-tracker adapter.
- Classify, inspect evidence, trace cause, dedupe, and create only clear new bugs.
- End one thread-only verdict with the configured `[benny:bug]`, `[benny:performance]`, or `[benny:other]` marker and optional tracker URL.
- Never post a source-channel root message.

After the triage automation is verified, give `CronCreate` this complete repro and fix intent:

- Name `benny-reproduce`.
- Read and follow `.zcode/automations/benny/skills/reproduce-and-fix-issues/SKILL.md` for every run.
- Fire on the same schedule and pick up the same new top-level reports in the configured source Slack channel.
- Use the configured repository and default branch.
- Read the source thread and reply only inside it.
- Include pull request creation and the configured tracker, control-adapter, and feature-map requirements. Paraphrase mapped user paths and states unless an eligible committed file is confirmed in the same repository.
- Wait for a trusted triage marker before acting.
- Reproduce the exact symptom twice through the mapped real UI and capture evidence.
- Verify an existing fix without authoring over it.
- Attempt an optional bounded fix only after confirmed repro, then open a draft pull request when proof and checks pass.
- Never post a source-channel root message.

Never write a live prompt that creates, schedules, or configures another automation, and never put a secret value in one.

### Existing automations

`CronCreate` is creation-only. Do not use it to replace automations that already exist.

Finish configuration, routing, control-adapter, and feature-map validation. Then list the automations with `CronList` and update each directly with `CronUpdate` (its `title` field is required on every update) or in the Automations management page, following this concise checklist.

For the existing triage automation, update:

- Name and description
- Direct instruction to read `.zcode/automations/benny/skills/triage-issue-reports/SKILL.md`
- Recurring schedule and source channel
- Slack MCP thread read and reply tools
- Issue-tracker adapter
- Paraphrased triage instructions, thread-only rule, and Benny verdict markers

For the existing repro automation, update:

- Name and description
- Direct instruction to read `.zcode/automations/benny/skills/reproduce-and-fix-issues/SKILL.md`
- Matching schedule and source channel
- Repository and default branch
- Slack MCP thread read and reply tools
- Pull request action
- Tracker, control-adapter, and feature-map requirements
- Paraphrased marker wait, evidence, verification, and bounded-fix instructions

Do not create replacements or duplicates.

### Creation boundary

Never call a direct automation backend service or a headless CLI to create or edit automations. Never put a secret value in a prompt. For new automations, the only finish path is a reviewed `CronCreate` call in this session.

Do not enable either automation until the thread-safety test passes after creation.

## 8. Test thread safety

Use a test channel or a harmless test report.

Before testing, confirm that the target repository's `.zcode/skills/`, `.zcode/automations/benny/`, every referenced secret-free configuration file, and the thread-guard hook entry in `.zcode/config.json` are committed on the branch used by the automation workspace. Confirm that both live prompts point at their exact committed operational files. If any check fails, stop. Tell the user that the automation cannot be enabled yet.

Verify:

1. Triage stores the root `thread_ts` and posts exactly one verdict as a reply.
2. The verdict contains one configured marker.
3. Repro accepts the marker only from the configured triage identity.
4. Repro keeps the same immutable source coordinates.
5. No source-channel root message appears.
6. The installed thread-guard hook denies a Slack post to the source channel that lacks a `thread_ts`.
7. A delegated worker cannot use any Slack write action.
8. Missing coordinates, a deleted parent, or a failed preflight produces no post and no tracker issue.

Enable normal traffic only after all eight checks pass.
