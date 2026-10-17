# pstack-resident

Resident mode for [pstack-zcode](https://github.com/ChHsiching/pstack-zcode) users who installed the skills with npx. Installing this plugin is the whole opt-in: a SessionStart hook injects the condensed poteto-mode summary into every session where poteto-mode is reachable, whether installed in the project tree or globally under the home directory.

If you installed the pstack-zcode plugin, skip this. That plugin carries the same hook behind a settings toggle.

- Injects on `startup|resume|clear|compact`. The hook always exits 0 and can never block a session.
- Uninstall in Settings → Plugins. No config surgery either way.
- The summary is pinned to poteto-mode by an anchor lint in the source repo. The full skill wins any ambiguity.
