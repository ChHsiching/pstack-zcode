# One plugin ships the whole collection; npx ships skills only

Two coherent install routes, no mixed vehicles: the ZCode plugin (`pstack-zcode`, source = this repo) installs everything — all 54 skills plus the resident-mode SessionStart hook, gated by a plugin user setting that defaults to off (Q8 holds: nothing resident unless the user flips the switch). The `npx skills add` route installs the skills only and never carries a hook. The standalone hook plugin that briefly existed between the two routes was incoherent — a hook whose payload depends on skills arriving through a different vehicle — and is superseded.

Consequences accepted with this change: the skills-CLI dual install to `~/.agents/skills` (cross-tool reuse) does not happen on the plugin route; plugin skills load namespaced (`pstack-zcode:<name>`, bare names still loadable); and the hook no longer probes the filesystem for poteto-mode — the user setting is the entire gate, because installing the plugin makes the skills session-reachable by definition.

Supersedes the distribution half of ADR-0003 (skills CLI remains as the skills-only route) and the standalone-plugin vehicle in ADR-0009's first addendum (the hook, its summary, and the anchor lint live at the repo root's `hooks/` now).

**Addendum (2026-10-17, owner direction, same day):** the full-collection plugin stands — it mirrors upstream pstack, which is itself one whole plugin with no category split (the "categorization" is runtime routing, not install-time selection). But removing the standalone hook broke the skills route's access to resident mode, so the marketplace carries **two** plugins: `pstack-zcode` (full collection, skills + hook behind a default-off toggle) for the plugin route, and `pstack-resident` (hook only, gated on poteto-mode reachability since the skills arrive by another vehicle) as the skills route's optional add-on. The summary ships in both plugins; the anchor lint requires the two copies byte-identical so they cannot fork.

## Considered Options

- Keep the standalone hook plugin beside the npx skills route — rejected: the hook only works when another vehicle delivered the skills; two installs, neither complete.
- npx carries a hook too — rejected: the skills CLI cannot ship hooks (verified in round 2), and post-install config surgery would reintroduce everything the plugin route avoids.
