#!/usr/bin/env node
// SessionStart hook for pstack-resident (ADR-0009, opt-in by installing
// this plugin). Emits the condensed poteto-mode summary as
// additionalContext when the session's directory has poteto-mode
// installed; prints nothing otherwise. Diagnostics go to stderr; the
// script always exits 0 because a SessionStart hook must never make
// noise or block a session.
//
// Protocol (ZCode): read one JSON event object from stdin, write one
// JSON object to stdout (must start with `{`).
//
// Manual smoke test:
//   printf '%s\n' '{"hook_event_name":"SessionStart","source":"startup","cwd":"<project>"}' \
//     | node hooks/session-start.mjs

import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const summaryPath = join(dirname(fileURLToPath(import.meta.url)), "..", "resident-summary.md");

// Install locations of poteto-mode, probed from the session cwd upward.
const SKILL_SUFFIXES = [
  "skills/poteto-mode/SKILL.md",
  ".zcode/skills/poteto-mode/SKILL.md",
  ".agents/skills/poteto-mode/SKILL.md",
];

function findPotetoMode(cwd) {
  let dir = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  for (;;) {
    for (const suffix of SKILL_SUFFIXES) {
      try {
        if (statSync(join(dir, suffix)).isFile()) return `${dir}/${suffix}`;
      } catch {}
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

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

readStdin((data) => {
  let cwd = null;
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed.cwd === "string" && parsed.cwd !== "") cwd = parsed.cwd;
  } catch {}
  if (!cwd && process.env.ZCODE_PROJECT_DIR) cwd = process.env.ZCODE_PROJECT_DIR;
  if (!cwd) return; // no session directory known: stay silent
  const skillFile = findPotetoMode(cwd);
  if (!skillFile) return; // not a poteto-mode project: zero cost
  let summary;
  try {
    summary = readFileSync(summaryPath, "utf8");
  } catch (error) {
    process.stderr.write(`[pstack-resident] cannot read ${summaryPath}: ${error.message}\n`);
    return;
  }
  process.stderr.write(`[pstack-resident] poteto-mode found at ${skillFile}\n`);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: summary.trim(),
      },
    }) + "\n",
  );
});
