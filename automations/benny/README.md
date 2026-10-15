# benny

benny gives you two ZCode automations for slack issue reports. one triages each report. the other reproduces confirmed bugs and may prepare a small draft fix.

the files in this directory are dormant setup and automation sources. they do not appear as slash skills.

## set it up

1. point ZCode at [`FOR_AGENTS.md`](./FOR_AGENTS.md) and name the target repository.
2. let setup merge this whole directory into the target at `.zcode/automations/benny/`. it must preserve destination-only files and review conflicts instead of overwriting local edits.
3. let setup install pstack's shared skills into the target repository's `.zcode/skills/` with `npx skills add ChHsiching/pstack-zcode` (workspace scope) for shared dependencies.
4. keep user-owned configuration outside the copied pack, for example in `.zcode/benny/`. adapt [`configuration.example.yaml`](./templates/configuration.example.yaml) and [`feature-map.example.md`](./skills/reproduce-and-fix-issues/references/feature-map.example.md).
5. commit `.zcode/skills/`, `.zcode/automations/benny/`, and any secret-free configuration before enabling either automation.
6. review each created automation with `CronList`, or update existing automations with `CronUpdate` or in the Automations management page. then send a harmless test report and verify every source-channel post stays in the original thread.
