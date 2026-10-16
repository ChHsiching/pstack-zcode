# setup-pstack offers a diversity panel when detection finds two families

ADR-0005 defaults every role to inherit-parent because the machine's models are unknowable in the abstract. But setup-pstack's detection reads the machine's actually-configured providers — `provider_config.json` union `config.json` (enabled plus credentials present); never `model-providers.json`, which is a template catalog where most entries have no keys — so the model inventory is real, not assumed. A blocked-model filter (the deepseek-flash family) is hard-coded into the detection step and never proposed.

When at least two distinct model families are configured, setup-pstack asks once, after budgeting and before the per-role questions: adopt a two-entry panel on the panel rows (first seat inherit-parent — the session-model follower — second seat the other family), keep everything inherited, or customize per role. A decline changes nothing and leaves no trace in the written state, so re-runs stay idempotent. The offer never becomes a default; the user's answer does.

## Considered Options

- Default diversity panels on detection — rejected: presumes spend the user did not authorize (the round-2 red line: pinning a model needs consent).
- Stay silent on detection (round-1 status quo) — rejected: the inventory is already in hand; one question is the upstream panel spirit with the choice kept where it belongs.
