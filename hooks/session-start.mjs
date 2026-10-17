#!/usr/bin/env node
// SessionStart hook for the pstack-zcode plugin (ADR-0009, ADR-0012).
// The poteto-mode summary is a user setting, off by default: when the user
// turns "summaryAtStart" on in the plugin's settings, every new session
// starts with the condensed poteto-mode summary injected. Diagnostics go
// to stderr; the script always exits 0 because a SessionStart hook must
// never make noise or block a session.
//
// Protocol (ZCode): read one JSON event object from stdin, write one
// JSON object to stdout (must start with `{`).
//
// Manual smoke test:
//   ZCODE_USER_CONFIG_SUMMARYATSTART=true \
//     printf '%s\n' '{"hook_event_name":"SessionStart","source":"startup"}' \
//     | node hooks/session-start.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const summaryPath = join(dirname(fileURLToPath(import.meta.url)), "resident-summary.md");

function once(fn) {
  let done = false;
  return (value) => {
    if (!done) {
      done = true;
      fn(value);
    }
  };
}

function readStdin(cb) {
  const done = once(cb);
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (data += chunk));
  process.stdin.on("end", () => done(data));
  process.stdin.on("error", () => done(data));
  // A hand-run without piped stdin would otherwise hang forever.
  setTimeout(() => {
    try {
      process.stdin.destroy();
    } catch {}
    done(data);
  }, 2000).unref();
}

// The userConfig boolean reaches hook processes through the environment
// (the host maps config keys to ZCODE_USER_CONFIG_<KEY>); accept the
// snake-case spelling too rather than trusting one mapping.
function summaryEnabled() {
  const v =
    process.env.ZCODE_USER_CONFIG_SUMMARYATSTART ??
    process.env.ZCODE_USER_CONFIG_SUMMARY_AT_START ??
    process.env.SUMMARY_AT_START;
  return v === "true" || v === "1";
}

readStdin(() => {
  if (!summaryEnabled()) return; // off (the default): zero cost
  let summary;
  try {
    summary = readFileSync(summaryPath, "utf8");
  } catch (error) {
    process.stderr.write(`[pstack-zcode] cannot read ${summaryPath}: ${error.message}\n`);
    return;
  }
  process.stderr.write("[pstack-zcode] summary at start on; injecting summary\n");
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: summary.trim(),
      },
    }) + "\n",
  );
});
