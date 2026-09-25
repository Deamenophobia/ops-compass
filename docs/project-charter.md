# Project scope

Ops Compass is a personal operations portal built on Backstage. It connects a
software catalog, documentation, timestamped observations and reviewed work records.
Users bring their own AWS and SSH configuration and choose the modules they need.

## Design priorities

- Give each observation a source, time and explicit freshness state.
- Make missing evidence visible; avoid inferring service health from unrelated checks.
- Connect service context, runbooks and worklogs in one workspace.
- Keep external operations bounded, configured and authenticated.
- Let an AI client read the same evaluated evidence as the dashboard.
- Keep runtime examples on the demo branch and real-use defaults minimal.

The current preview targets one backend and a persistent SQLite journal. It does
not establish high availability, live provider access or model-answer quality.
Read the [release notes](releases/preview.md) for the tested scope and limits.

Development remains in a separate private GitLab repository. GitHub receives
reviewed public releases without private operational records or development history.
