# First public preview

Release: **v0.1.0**, 26 September 2026. License: MIT for original project materials;
third-party licenses are preserved separately.

Start with [Local setup](../guides/local-setup.md), then [choose optional features](../guides/features.md).
`main` has no sample workloads. `demo` adds synthetic observations and an
[illustrated walkthrough](https://github.com/Deamenophobia/ops-compass/blob/demo/docs/guides/demo-gallery.md).

## Verification inherited from the application review

A separate clean development checkout was installed on Windows with Node 22.14.0,
Python 3.12.10 and Yarn 4.13.0. Immutable install, type checking, lint, frontend/backend
builds and strict handbook generation passed. Verification included 18 common tests,
65 backend tests, 23 Python tests and 10 deterministic model-client tests.
Seven browser flows passed on each branch. A real local MCP SDK connection checked
the exact three-tool allowlist, tool calls, scoped authentication and rejected requests.

These are application-review results, not claims of live AWS access, email delivery
or a real model evaluation. Public export checks are recorded in `release-manifest.json`
and the published release notes.

## Limits to account for

| Area | Current boundary |
| --- | --- |
| Sign-in | Guest is for loopback development. Hosting requires configured identity and persistent storage. |
| Connections | Preparing/saving/testing a profile does not start a collection schedule or establish service health. |
| Observations | Snapshots expire. Portal refresh does not run SSH; collectors are separate. |
| Email | Starts disabled. A provider's acceptance is distinct from inbox receipt. Delivery runs inside the backend. |
| Storage | SQLite assumes a single backend. Preserve and verify backups before an upgrade. |
| AI | Read-only MCP/HTTP context and an optional external model client; no built-in chat or autonomous repairs. |
| Cloud and deployment | Examples need user-selected targets, credentials and environment-specific verification. CI is inactive. |
| Dependencies | The installed set has React/Material UI peer-range warnings. Windows can omit optional `cpu-features` when a compiler is unavailable. |
| Dependency advisories | After the release fixes, the registry audit reports 7 moderate and 1 low finding, with none high/critical. See the [dependency review](dependency-review.md); this is not an advisory-free release. |
| Platforms | The fresh-install review covered Windows/Node 22. It did not freshly verify Node 24, Linux/WSL or a Docker image build. |

The release exports tracked source with public documentation and a fresh public Git
history. Private development logs, local credentials, journals and infrastructure
records are excluded. Public updates will continue from this history.
