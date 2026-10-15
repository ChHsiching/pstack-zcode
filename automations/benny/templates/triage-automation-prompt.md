# Triage automation prompt

> Source material for the copied setup workflow. Paraphrase this intent into the scheduled ZCode automation's prompt after setup confirms that the copied pack is committed in the repository where the automation will run.

Read and follow `.zcode/automations/benny/skills/triage-issue-reports/SKILL.md` for this run.

Configuration source. Include this repository-relative path only when it is committed in the same target repository. Otherwise paraphrase the configured values. Never use a source or cache path:

```text
{{BENNY_CONFIG_PATH}}
```

Schedule:

```text
every {{SCHEDULE_INTERVAL_MINUTES}} minutes
```

Each firing scans the configured source Slack channel through the configured Slack MCP server for a top-level report whose thread holds no triage verdict yet. That report is this run's trigger. Freeze its channel and root thread timestamp as:

```json
{
	"source_channel_id": "{{SLACK_CHANNEL_ID}}",
	"message_ts": "{{SLACK_MESSAGE_TS}}",
	"thread_ts": "{{SLACK_THREAD_TS_OR_EMPTY}}"
}
```

The creation intent should describe this as a recurring scan of the configured source Slack channel for new top-level reports.

Treat the source channel and root thread timestamp as immutable. If either is missing or does not match configuration, stop without posting or writing to the issue tracker.

The committed operational file owns classification, attachment review, cause tracing, routing, dedupe, tracker writes, and the final verdict. Post no progress messages. Never post a root message in the source channel.

The coordinator is the only Slack poster. Any delegated worker must be read-only, return findings only, and receive an explicit ban on every Slack write action.

End the single verdict with exactly one configured marker:

```text
[benny:bug]
[benny:performance]
[benny:other]
```

A bug or performance marker may add `tracker=<URL>`.
