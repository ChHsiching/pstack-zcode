### Session pickup

**You own the resume point. Read the prior trail, don't redo it.**

1. Locate the prior trail. Session material retrieved with `ReadSessionContext`, one call per `sess_*` session id (the prompt carries the id; when it does not, `python scripts/session-store.py list`, run from the workspace root, names this workspace's recent interactive sessions read-only — if it errors, ask for the id. Do not read another project's sessions, that crosses workspace boundaries and reads private chats from unrelated projects), or a pushed branch. Read the metadata overview and last messages first, then scan back for the decision points. Parse a long transcript in a subagent and keep the reduced timeline in the main thread (the **pstack-principle-guard-the-context-window** skill). Pick each subagent's reasoning level and fast or standard speed for the job, per the Subagents section.
2. Reconstruct operational state. The branch and worktree, what already landed (`git log`, `git diff` against the base), the open todos, the decisions made. The prior trail is authoritative input. Resist the bias to re-derive it.
3. Diff done vs pending. Compare what shipped against what was planned, name the resume point, do not re-run the prior repro or redo completed work. A "let me verify from scratch" pass means you're treating the trail as untrustworthy when it's authoritative.
4. Route the remaining work to the matching playbook and pick the verdict: continue the execution, ship a finished recommendation, ratify or override a prior conclusion, or postmortem a failed run. The pickup playbook ends here. The routed playbook owns the rest.
5. Verify the inherited claims against the original goal on the real artifact (the **pstack-principle-prove-it-works** skill). A passing prior self-report is not the proof.

**Reply:** where the prior agent stopped, what you inherited vs redid (ideally nothing redone), the resume point, and the outcome.
