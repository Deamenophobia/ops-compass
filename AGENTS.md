# Project instructions

Read the handbook and release notes before substantial changes. Keep implementation,
tests and documentation aligned. The root README is a short usage entry point;
technical explanations and runbooks belong in `docs/`.

- Keep private configurations, keys, databases and real infrastructure records out of commits.
- Treat demo data as synthetic and stale/missing observations as unknown.
- Preserve authentication, owner-only writes and the read-only MCP allowlist.
- Do not add arbitrary shell execution or activate cloud resources, CI or email as
  a side effect of local development. Users explicitly configure their own targets.
- Run meaningful affected checks and report the limits of verification.
- `main` starts without sample workloads; `demo` adds examples. Keep common code aligned.
- This public repository contains reviewed releases. The maintainer develops in a
  separate private repository; do not rewrite public history or mirror private history.
