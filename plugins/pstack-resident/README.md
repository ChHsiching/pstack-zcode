# pstack-resident

Opt-in resident mode for [pstack-zcode](https://github.com/ChHsiching/pstack-zcode). Installing this plugin is the whole opt-in: a SessionStart hook injects the condensed poteto-mode summary (~300 tokens) into every session of a project that has poteto-mode installed. Sessions in other projects, and machines without this plugin, get nothing — pstack-zcode stays per-task by default.

- Injects on `startup|resume|clear|compact`; the hook always exits 0 and can never block or fail a session.
- Cost: the summary (~300 tokens) per new session in poteto-mode projects.
- Uninstall: Settings → Plugins → pstack-resident → remove. No config surgery either way.
- The summary is pinned to poteto-mode by an anchor lint in the source repo; the full skill wins any ambiguity.
