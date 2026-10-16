#!/usr/bin/env node
// Idempotent installer for the resident-mode SessionStart hook (ADR-0009).
// Writes only the user-level config (~/.zcode/cli/config.json): merges one
// hooks.SessionStart entry pointing at inject.mjs next to this file, keeping
// every existing key. --remove deletes exactly that entry plus any empty
// container the install created, restoring the prior config content.
// Workspace-level hooks are divergently documented across sources and are
// never written. Config snapshots at session start: start a fresh session
// after installing or removing.
//
// Usage: node scripts/resident/install.mjs [--remove]

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const injectPath = join(dirname(fileURLToPath(import.meta.url)), "inject.mjs").replace(/\\/g, "/");
const marker = "/scripts/resident/inject.mjs";
const statusMessage = "pstack resident: poteto-mode summary";
const configPath = join(homedir(), ".zcode", "cli", "config.json");

const removeMode = process.argv.includes("--remove");

function loadConfig() {
  if (!existsSync(configPath)) return { config: {}, existed: false };
  const raw = readFileSync(configPath, "utf8");
  if (raw.trim() === "") return { config: {}, existed: true };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("top level is not an object");
    }
    return { config: parsed, existed: true };
  } catch (error) {
    console.error(`install: refusing to touch unparseable ${configPath}: ${error.message}`);
    process.exit(1);
  }
}

function isOurs(entry) {
  if (typeof entry !== "object" || entry === null || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some(
    (hook) =>
      typeof hook === "object" &&
      hook !== null &&
      Array.isArray(hook.args) &&
      typeof hook.args[0] === "string" &&
      hook.args[0].replace(/\\/g, "/").endsWith(marker),
  );
}

function writeAtomic(path, config) {
  const text = JSON.stringify(config, null, 2) + "\n";
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  // Windows rename can hit a transient EPERM from antivirus; retry bounded.
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      renameSync(tmp, path);
      return;
    } catch (error) {
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  throw lastError;
}

const { config } = loadConfig();
mkdirSync(dirname(configPath), { recursive: true });

let hooksCreated = false;
if (typeof config.hooks !== "object" || config.hooks === null) {
  config.hooks = {};
  hooksCreated = true;
}
const hooks = config.hooks;
const hadExplicitFalse = hooks.enabled === false;
if (hooks.enabled === undefined) hooks.enabled = true;
if (typeof hooks.events !== "object" || hooks.events === null) hooks.events = {};
const events = hooks.events;
if (!Array.isArray(events.SessionStart)) events.SessionStart = [];
const kept = events.SessionStart.filter((entry) => !isOurs(entry));
const replacedCount = events.SessionStart.length - kept.length;

if (removeMode) {
  events.SessionStart = kept;
  if (events.SessionStart.length === 0) delete events.SessionStart;
  if (Object.keys(events).length === 0) delete hooks.events;
  // Drop the skeleton only when it is exactly the shape this installer
  // writes ({enabled: true}, no events left). A hooks object holding any
  // other key survives. Known edge: a pre-existing empty {enabled: true}
  // shell is indistinguishable from our skeleton and gets removed too.
  const onlyOurSkeleton =
    Object.keys(hooks).length === 1 && hooks.enabled === true && hooks.events === undefined;
  if (onlyOurSkeleton) delete config.hooks;
  writeAtomic(configPath, config);
  console.log(
    replacedCount === 0
      ? `install: no resident hook found in ${configPath}; nothing changed.`
      : `install: removed ${replacedCount} resident hook entr${replacedCount === 1 ? "y" : "ies"} from ${configPath}.`,
  );
  console.log("install: config snapshots at session start; start a fresh session for it to take effect.");
  process.exit(0);
}

events.SessionStart = [
  ...kept,
  {
    hooks: [
      {
        type: "process",
        command: "node",
        args: [injectPath],
        timeoutMs: 5000,
        statusMessage,
      },
    ],
  },
];
writeAtomic(configPath, config);
console.log(
  replacedCount === 0
    ? `install: registered the resident SessionStart hook in ${configPath}.`
    : `install: re-registered the resident SessionStart hook in ${configPath} (replaced ${replacedCount} prior cop${replacedCount === 1 ? "y" : "ies"}, no duplicate left).`,
);
if (hadExplicitFalse) {
  console.log("install: note: hooks.enabled was explicitly false and was left as-is; set it to true for the hook to run.");
}
console.log(`install: injects scripts/resident/resident-summary.md only in projects that have poteto-mode.`);
console.log("install: config snapshots at session start; start a fresh session to see the summary.");
