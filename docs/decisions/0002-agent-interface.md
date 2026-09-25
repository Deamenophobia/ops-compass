# ADR 0002: expose evidence through native Backstage MCP actions

Status: accepted, 2026-09-25.

## Context

The user requested an AI-agent interface without model training. Operations and
runbook evidence already exist; the useful next step is to make that evidence
available to a chosen AI client before adopting a model provider.

## Decision

Use Backstage's MCP Actions backend and registry with an exact three-action
allowlist. The existing authenticated HTTP API and new agent endpoints share one
evidence service. Both apply the existing freshness semantics at request time.
Curated health/email quick checks cite the complete versioned handbook. There is
no arbitrary file read, URL fetch, command input, retrieval crawler, or model call.

An Agent access page previews the data contract and supplies connection guidance.
An optional loopback launcher creates a rotating process token, restricted to the
two required plugins, in an ignored client configuration file. The normal app
configuration does not require an agent token. No personal AI client's settings
are changed automatically.

## Consequences

- Any compatible local MCP client can bring its own model. Training is unnecessary.
- Sources, timestamps, unknown states, citations and missing work remain explicit.
- Provider failures are redacted before reaching either HTTP or MCP clients.
- Context is a snapshot and must be fetched again as evidence ages. Demo never
  represents current AWS health; draft outlines are not records of completed work.
- Data returned to an external client may be sent to its model provider. There is
  no per-entity authorization in this local version, and client-generated prose
  still needs evaluation and human review.
- Static tokens are a local development bridge. Production identity, transport,
  authorization and rotation require a separate design before remote exposure.
- Quick checklists and full runbooks must be reviewed together when procedures change.

## Verification

Domain/API tests cover stale/future/empty evidence, scoped requests, missing IDs,
untrusted source text, invalid arguments and redacted source failures. The protocol
smoke test uses an actual MCP SDK client against the running app to verify tool
discovery, dispatch, authentication and access restrictions. Browser tests cover
previewing, switching purpose and removing old data after a source error. Model
quality is not claimed by these interface tests.
