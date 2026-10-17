#!/usr/bin/env node
// SessionStart hook for pstack-resident (ADR-0009, opt-in by installing
// this plugin). Emits the condensed poteto-mode summary as
// additionalContext when poteto-mode is reachable from the session — a
// project-level install in the session's tree, or a global install under
// the home directory; prints nothing otherwise. Diagnostics go to stderr;
// the script always exits 0 because a SessionStart hook must never make
// noise or block a session.
//
// Protocol (ZCode): read one JSON event object from stdin, write one
// JSON object to stdout (must start with `{`).
//
// Manual smoke test:
//   printf '%s\n' '{"hook_event_name":"SessionStart","source":"startup","cwd":"<project>"}' \
//     | node hooks/session-start.mjs

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const summaryPath = join(dirname(fileURLToPath(import.meta.url)), "..", "resident-summary.md");

// Project-level install locations of poteto-mode, probed from the session
// cwd upward. The walk stops on its own; global locations are probed
// explicitly below so behavior does not drift with the drive letter.
const SKILL_SUFFIXES = [
  "skills/poteto-mode/SKILL.md",
  ".zcode/skills/poteto-mode/SKILL.md",
  ".agents/skills/poteto-mode/SKILL.md",
];
// Global install locations, always under the home directory.
const GLOBAL_SUFFIXES = [
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
    if (parent === dir) break;
    dir = parent;
  }
  // A globally installed poteto-mode is session-reachable from any project
  // on any drive; probe the home-directory locations directly.
  const home = homedir().replace(/\\/g, "/");
  for (const suffix of GLOBAL_SUFFIXES) {
    try {
      if (statSync(join(home, suffix)).isFile()) return `${home}/${suffix}`;
    } catch {}
  }
  return null;
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
  if (!skillFile) return; // poteto-mode not reachable: zero cost
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
