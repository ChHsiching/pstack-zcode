# Orchestrate-style playbooks become dynamic-workflow topologies

ZCode forbids nested subagents (depth 1), while pstack's orchestrate/autopilot playbooks assume main agent → poteto-agent → helper down to depth 3. Adapted orchestrate flows put the orchestration in the workflow script itself (loops, queues, and verification gates are plain TypeScript control flow and cost no nesting depth); workers are spawned by the script with self-contained briefs; escalation back to the main agent remains the fallback when the script cannot decide.

Verified against ZCode source: workflow actors run with the parent toolset minus meta-tools, can read skills, and cannot spawn further subagents — which is why the playbook's "spawn a helper" steps must become script topology rather than delegated instructions.
