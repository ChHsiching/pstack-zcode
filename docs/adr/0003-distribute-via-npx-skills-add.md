# Distribute as a skills collection via `npx skills add`

Installation is `npx skills add ChHsiching/pstack-zcode` (the vercel-labs/skills CLI, which treats ZCode as a first-class target). The repo root `skills/` directory is that CLI's prime discovery path, so all 54 skills are found directly. There is no ZCode plugin packaging (`.zcode-plugin/`, `marketplace.json`) and no custom installer — the community-standard CLI is the only distribution channel.

## Considered Options

- ZCode plugin marketplace packaging — rejected: extra machinery, and plugin skills load at the lowest priority where same-named user skills shadow them.
- A custom `npx` wrapper package — rejected: reinvents the community tool for no gain.

## Consequences

- The two subagents (`agents/poteto-agent.md`, `agents/comment-sicko.md`) are not installed by the skills CLI; the README documents copying them to `~/.zcode/agents/`.
- Final install-command behavior must be verified after adaptation lands (discovery was validated against a synthetic tree during research).
