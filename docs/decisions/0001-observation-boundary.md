# ADR 0001: Read-only observation boundary

Date: 2026-09-25. Status: accepted for the first local slice.

## Context

Existing services run on a mixture of Docker and host processes. Repository contents
and runtime state have already differed during assessment. A useful portal must
distinguish documented intention from current operational evidence.

## Decision

Use a real Backstage app with separate common, frontend, and backend operations
packages. All adapters return the same validated, timestamped snapshot shape.
The backend evaluates freshness and exposes one authenticated read endpoint.
The frontend never receives cloud credentials or chooses arbitrary SSH commands.

Begin with explicitly labeled demo fixtures, a file adapter for SSH collections,
and a named-metric-alarm CloudWatch adapter. Snapshot collection runs outside the
web server. Stale/future data becomes unknown while preserving the last reported state.
Source errors produce 503 and clear the frontend's previous successful results.

Backstage remains the catalog and documentation surface. Provisioning, notification
delivery, deployment, rollback, and AI assistance require distinct capabilities.
Do not wire an unconstrained shell executor into a dashboard button.

## Alternatives

- Browser-to-AWS: rejected because it exposes credential/authorization concerns and
  couples UI code to AWS responses.
- Run SSH on every page refresh: rejected because it couples web traffic to production
  access and makes collection scheduling and failures harder to control.
- All-new monitoring stack: deferred because existing monitoring and an email bridge
  may already solve part of the problem.
- A static dashboard without Backstage: rejected because the catalog and TechDocs
  relationships are part of the actual product requirement.

## Consequences

Snapshot freshness and collection scheduling are visible responsibilities. CloudWatch
reads incur API traffic and need credentials. Guest access and SQLite are development
choices, not production identity or persistence. Additional adapters can reuse the
schema without changing UI semantics; their measurements still need domain-specific
verification. Multiuser authorization will precede any write/operate capability.
