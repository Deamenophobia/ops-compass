# Architecture and framework

Ops Compass is a Backstage application with custom operations plugins. Its
frontend and backend share a small contract for timestamped health evidence.

## Stack

| Layer              | Implementation                                                    | Role                                                                                |
| ------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Frontend           | React 18, TypeScript, React Router                                | Pages, navigation and interactions                                                  |
| Design             | Backstage components, Material UI, Backstage UI                   | Soft daylight theme, forms, tables and layouts                                      |
| Portal             | Backstage 1.55                                                    | Catalog, authentication, plugin wiring, search and TechDocs                         |
| Backend            | Node.js, TypeScript, Express through Backstage                    | Authenticated APIs and source adapters                                              |
| Contract           | Zod v3 compatibility API                                          | Runtime validation and consistent freshness rules                                   |
| Storage            | Private SQLite file for operations; other local plugins in memory | Persistent journal, reviewed documents and preferences                              |
| Deployment storage | PostgreSQL configuration template                                 | Intended persistent plugin storage; not deployed                                    |
| Host collection    | Python standard library and SSH                                   | Fixed disk/Docker checks, optional named containers, heartbeat files and TLS expiry |
| AWS adapters       | AWS SDK for JavaScript                                            | Named CloudWatch alarms, monthly AWS budget reads, configurable SNS notifications   |
| Delivery and email | GitLab REST, Resend HTTPS or SNS                                  | Pipeline/runtime comparison; optional user-configured notification route            |
| Handbook           | Markdown, MkDocs, TechDocs                                        | Versioned procedures and engineering records                                        |
| AI interface       | Native Backstage MCP Actions and HTTP                             | Read-only evidence and runbook access for external clients                          |
| Workspace          | Yarn workspaces and Backstage CLI                                 | One repository for app, backend and shared plugins                                  |
| Verification       | Jest, Supertest, Playwright, Python unittest                      | Domain, API, browser and collector checks                                           |

## Data flow

```text
Browser / React ── authenticated HTTP ──┐
                                      ├── Backstage operations service
External AI client ── MCP tools ────────┘          │
                                      validate + evaluate freshness
                                                 │
                                 one configured observation source
                                 /               |                \
                              demo          JSON snapshot      CloudWatch
                                                 ↑
                                      Python + fixed SSH checks
```

The browser and agent see the same evaluated evidence. Snapshot mode reads a
saved collection; opening or refreshing the page does not run SSH. CloudWatch
mode reads only configured alarms. Observations are not a historical metrics
database: their source and timestamps must accompany any saved incident record.

## Repository map

| Location                     | Responsibility                                                       |
| ---------------------------- | -------------------------------------------------------------------- |
| `packages/app`               | React entry point, theme, sidebar and plugin assembly                |
| `packages/backend`           | Backend plugin registration and deployment template                  |
| `plugins/operations`         | Operations, Workspace, AWS inventory and Agent access pages          |
| `plugins/operations-backend` | Providers, authenticated routes, runbooks and MCP actions            |
| `plugins/operations-common`  | Shared schemas, types and freshness evaluation                       |
| `catalog`                    | Portal ownership and system entities; sample workloads only on demo  |
| `scripts`                    | Local launchers, SSH collector and protocol verification             |
| `docs`                       | Canonical manuals, decisions, roadmap and release notes                   |
| `private`                    | Ignored local inventory, observations and connection credentials     |

The [code walkthrough](guides/code-walkthrough.md) follows a request across these
files. [Frontend design](guides/frontend-design.md) explains the visual layer.

## Runtime and authentication

Development serves the frontend on port 3000 and backend on 7007. The lower-memory
preview serves the built frontend and backend together on port 7007. Both listeners
are loopback-only in local configuration. Guest sign-in is for local development.

APIs use Backstage's authentication boundary. The optional local MCP credential is
restricted to the operations and MCP plugins. An exact three-action allowlist
exposes overview, runbook and context reads. The project does not run a model;
the connected AI client supplies one. Details are in [Agent access](guides/agent-access.md).

## Current scope and limits

The portal has catalog and TechDocs integration, unconfigured/demo/SSH/CloudWatch modes,
an operations dashboard, a persistent workspace and a read-only agent interface. SSH collection has been
covered by collector tests. Live AWS API identity/CloudWatch reads and actual
email delivery need verification in each configured environment. Healthy checks do not prove whole-service
availability, successful backups or inbox delivery.

The operations workspace stores transitions, notes, backup attestations and reviewed
Markdown worklogs. Its timer observes sources while the backend is running. Owner-only
writes require a configured user identity; MCP/service credentials cannot perform them.
GitLab and AWS adapters are optional. Email recipients and planning amounts start blank.
Versioned migrations preserve existing records, and a transactional notification
queue supports background delivery and bounded recovery. See
[storage and delivery](guides/storage-and-delivery.md) for operational limits.
Main and demo use separate private database files. Local SQLite assumes one backend;
it is not a distributed event queue or an independent always-on alert manager.
See the [workspace decision](decisions/0003-workspace-journal.md) for failure semantics.

The production configuration now selects GitLab sign-in and persistent per-plugin
SQLite files for one backend. The container recipe includes TechDocs dependencies;
backup/restore tooling, a fixed sandbox release runner, ECR/SSM Terraform and an
inactive OIDC CI example are available. The external MCP model client validates
evidence and citation IDs before writing a draft. Configuration and mocked contract
tests do not establish live OAuth, AWS API/IAM or model-quality results. See the
deployment manuals and [roadmap](roadmap.md) for verified boundaries and remaining
connections. Broader PM2/VPN observation and multi-instance storage remain future work.

Development proceeds locally and in private GitLab. GitHub receives
separate reviewed releases; see [Repository workflow](guides/repository-workflow.md).

## Attribution

The application began with the [Backstage scaffold](https://backstage.io/docs/getting-started/).
Original project materials use MIT. Upstream materials retain their own licenses;
see the repository LICENSE and THIRD_PARTY_NOTICES.md files.
