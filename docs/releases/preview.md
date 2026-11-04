# Workspace and infrastructure observation preview

Source preview: **0.2.0-alpha.1**, reviewed 4 November 2026. Original project
materials use MIT; third-party licenses are preserved. This update is published as
ordinary branch commits, without version tags or a GitHub release entry.

Start with [Local setup](../guides/local-setup.md) and
[optional features](../guides/features.md). `main` starts without sample workloads;
`demo` adds synthetic observations and an
[illustrated walkthrough](https://github.com/Deamenophobia/ops-compass/blob/demo/docs/guides/demo-gallery.md).

## What changed

- Modular core and personal/team workspace profiles, with membership checks and
  workspace-scoped operations, settings, connections and delivery records.
- Optional read-only [Kubernetes observations](../guides/kubernetes.md): deployment
  readiness, pod restarts and warning summaries from explicitly collected snapshots.
- Optional [declared dependencies](../guides/dependencies.md): applications,
  databases and caches linked through catalog relationships, alongside each entity's
  own checks. Missing evidence stays unknown; failures do not propagate automatically.
- Upgrade/backup/rollback rehearsals, synthetic examples and refreshed dependencies.

## Verification

The combined application review used Windows, Node 22.14.0, Python 3.12.10 and
Yarn 4.13.0. Type checking, repository lint, frontend/backend builds and strict
handbook generation passed. Tests cover 120 application cases in 24 suites,
28 Python collector/client cases, 10 model-client cases and 8 public-export cases.
The publication worklog records the final export and dependency checks.

The actual previous public application (`f667789`) was exercised with a synthetic
journal through its authenticated HTTP API. Upgrade retained notes, budget choices
and saved features; workspace ownership/isolation, restart, restored candidate
backup and pre-upgrade rollback passed. New features stay disabled for existing
saved choices. Browser checks covered desktop/mobile, disabled routes, empty search,
source failure, recovery and independent database/consumer health. Gallery captures
contain synthetic data only.

The local Kubernetes harness was attempted again before publication. Docker had no
usable Linux engine and WSL2 reported disabled virtualization. No cluster was
created: real API, TLS and RBAC integration stages remain **unverified**. Mocked
collector tests are not a substitute. See the [Kubernetes record](kubernetes.md)
and [repeatable rehearsals](../guides/release-preparation.md).

## Limits

| Area | Current boundary |
| --- | --- |
| Identity | Guest login is for loopback development. Hosting needs configured identity and persistent storage. |
| Workspaces | Operational data is scoped; catalog, search and TechDocs remain shared within a trusted installation. This is not full Backstage multi-tenancy. |
| Observations | Snapshots expire; refresh does not run SSH or Kubernetes collection. No orchestration, traffic discovery or automatic root-cause inference. |
| Storage | SQLite assumes one backend. Preserve configuration and verify backups before upgrading. |
| Connections and AI | Profiles require user configuration. MCP is read-only; model, cloud, email and team OAuth integrations need installation-specific verification. |
| Dependencies | Registry audit: 13 advisories, including 2 high, 9 moderate and 2 low; none critical. The [assessment](dependency-review.md) covers the remaining paths and Zod compatibility risk. This is not an advisory-free or production-ready release. |
| Platforms | Fresh installation was reviewed on Windows/Node 22. Node 24, Linux/WSL and Docker image builds were not freshly verified. Existing React/Material UI peer warnings and optional Windows cpu-features compilation warnings remain. |

Publication exports reviewed tracked source into the existing public Git history.
Private worklogs, credentials, journals and infrastructure records are excluded.
CI and deployments remain inactive. Historical [first-preview notes](v0.1.0.md)
retain their original scope and results.
