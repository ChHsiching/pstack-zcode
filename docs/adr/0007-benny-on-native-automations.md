# benny runs on native ZCode automations, no external infrastructure

benny's two Cursor automations (Slack triage, reproduce-and-fix) are adapted in v1 onto ZCode's native automation family: `setup-benny` creates scheduled automations (CronCreate) whose prompts perform the whole loop — poll the Slack channel via a Slack MCP, follow the benny instruction files in-repo, reply in-thread, file tickets via `gh`, drive UI reproduction via the browser-use plugin. No poller service, no headless-CLI runner, no webhook bridge.

## Consequences

- Runs only while the machine/app is awake; missed firings are skipped, not backfilled (Cursor's version runs 24/7 in its cloud — an accepted trade for zero infrastructure).
- benny's "never post to the channel root" rule can additionally be enforced mechanically via a PreToolUse hook instead of prompt discipline alone.
