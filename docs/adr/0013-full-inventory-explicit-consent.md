# Detection is a full inventory; model dispatch traces to an explicit user choice

Upstream pstack grew where model choice routes inside one subscription: a skill picking a model on its own spends nothing new. ZCode machines are different. Every provider is configured by the user, billing varies per provider, and some of it is metered per call. A skill that picks a model on its own spends the user's money.

Two rules follow. Detection is a full inventory: setup-pstack proposes every model the machine can actually run, and no blacklist, whitelist, or family filter ships in a skill — what a machine's user may pin is their call. And every dispatch traces to an explicit user choice: with no models file every spawn omits the model field and follows the session model (ADR-0005's inherit-parent default); a models.md line means the user answered for it in setup or wrote it by hand; unattended runs — automations, saved workflows nobody is watching — spawn inherit-only. A machine that must not offer a model disables it in that machine's provider config, where detection never sees it. Machine-level concerns stay machine-level.

This reverses the model-family filter that commit c15d728 added to detection under ADR-0010. The filter encoded one machine's billing concern as a universal forbid: it hid configured models from every machine, and sitting upstream of validation it also forced out hand-written pins — removing the very choice these rules guarantee. The consent ADR-0010 already required ("pinning a model needs consent") never needed a blacklist; inherit-parent plus the question was the whole mechanism.

## Considered Options

- Keep the filter and add a per-machine override line in the models file (proposed in issue #28) — rejected: an escape hatch for a rule that should not exist.
- Relax validation only, so hand-written pins survive reruns — rejected: the model still vanishes from the offer list without explanation.
- Block nothing and stop asking — rejected: consent is the mechanism; dropping it presumes spend the user did not authorize.
