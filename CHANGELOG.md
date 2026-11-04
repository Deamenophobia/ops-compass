# Changelog

## 2026-11-04 — Declared service dependencies

- Optional Backstage catalog dependency map for applications, databases and caches.
- Separate declared relationships from each entity's own workspace observations;
  missing or expired checks remain unknown and failures do not propagate automatically.
- Existing installations keep the module off until enabled in Workspace features.
  Setup instructions and synthetic demo examples are included.

## 2026-11-04 — Kubernetes observations

- Optional workspace-scoped, read-only Kubernetes page with deployment readiness,
  pod status/restarts, warning summaries and catalog/dashboard links.
- Explicit HTTPS collector, bounded sanitized snapshots, freshness/coverage checks
  and synthetic examples. Main and existing journals keep the feature disabled.
- Setup and namespace RBAC instructions in the Kubernetes handbook guide.
- Retain historical observations during refresh/failure, expire current status,
  clear rejected access, and explain empty searches and collection failures.
- Published-version upgrade, restart and backup/rollback rehearsal; optional local
  kind integration harness (real-cluster validation remains blocked on the review host).
- Compatible dependency patches and a fresh audit: 13 advisories remain, including
  two high and none critical; their paths and compatibility limitations are assessed
  in the dependency review. Real-cluster validation is still blocked on this host.

## Unreleased — modular core and workspaces

- Internal core packages built on Backstage plugin, module and permission APIs.
- Personal default and opt-in team profile in one application/release; workspace
  selection, administrator/user memberships and protected configuration writes.
- Workspace-scoped settings, journal, documents, connections and delivery jobs;
  migration preserves existing data in the personal workspace.
- Explicit per-workspace source configuration and permission-aware MCP actions.
- Upgrade, core extension and release guides. Catalog and TechDocs remain shared;
  the team preview retains the single-backend deployment constraint.

## 0.1.0 — first public preview — 2026-09-26

- Backstage catalog and handbook with an operations overview that preserves source,
  observation time, freshness and unknown states.
- Nine optional modules with persistent workspace choices, UI gates, API admission
  checks and background-work controls. Fresh main starts minimal; demo adds examples.
- User-configured AWS/SSH connection drafts, saved profiles and bounded access tests.
- Container observations, separate worker heartbeats, GitLab revision comparisons,
  history, reviewed Markdown worklogs and maintenance records.
- Optional AWS Budget reads and Resend/SNS routes with a durable delivery queue.
- Three authenticated read-only MCP tools and an optional external model client.
- Production configuration examples, SQLite backup/restore tools and inactive
  sandbox/ECR/SSM/Terraform/CI examples.
- Soft theme, original compass artwork and a screenshot walkthrough on `demo`.

This tag starts the public release history. Earlier private iteration labels are
not public release versions. See [verification and limitations](docs/releases/preview.md).
