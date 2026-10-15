#!/usr/bin/env node
// Benny thread guard: a PreToolUse hook that denies Slack MCP message posts to
// the configured source channel's root. Setup passes the source channel ID as
// the only argument. Fail closed: with no source channel argument, or an
// unreadable payload, every root post is denied.

const sourceChannel = (process.argv[2] || "").trim();

function deny(reason) {
	process.stderr.write(`benny thread guard: ${reason}\n`);
	process.exit(2);
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
	let event;
	try {
		event = JSON.parse(raw);
	} catch {
		deny("unreadable tool payload; denying every Slack root post.");
	}
	const toolName = String(event.tool_name || "");
	const input = event.tool_input || {};
	// Only a tool call that sends message content to a channel can create a
	// channel-root post. Reads, reactions, and edits of existing messages
	// carry no fresh content payload and pass.
	const sendsContent =
		input.channel !== undefined &&
		(input.text !== undefined || input.blocks !== undefined || input.content !== undefined);
	if (!sendsContent) {
		process.exit(0);
	}
	if (typeof input.thread_ts === "string" && input.thread_ts.length > 0) {
		process.exit(0);
	}
	if (sourceChannel === "") {
		deny("no source channel configured; denying every Slack root post.");
	}
	if (input.channel === sourceChannel) {
		deny(
			`denied a root post to source channel ${sourceChannel} from ${toolName}: set thread_ts to reply inside the report thread.`
		);
	}
	process.exit(0);
});
