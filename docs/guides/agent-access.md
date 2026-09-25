# Agent access through MCP or HTTP

Ops Compass exposes three read-only tools using Backstage's native MCP Actions
backend. Your MCP client supplies the AI model. This portal needs no training,
embeddings, vector database, or model API key. It does not make model calls.

Use **Agent access** in the sidebar to preview and copy exactly the structured
context an agent can request. The preview is deterministic facts and a draft
outline, not a generated answer. It sends no data to a model provider. Connecting
an external AI client can send tool results to that client's provider, so review
the preview and your client's data policy before connecting private observations.

## Start a local connection

Enable **AI agent interface** in **Workspace features** first. New main workspaces
leave it off; the transport may still advertise tool names, but every invocation
is rejected while the module is disabled. Starting with `-AgentAccess` supplies
transport credentials and does not override this choice.

Build the application and install the documentation environment as described in
[Local setup](local-setup.md). Stop an existing preview on port 7007, then run:

```powershell
.\scripts\start-preview.ps1 -AgentAccess
```

The launcher creates a random token for this process and writes an ignored
`private/agent-client.local.json` file. It contains the MCP URL and bearer header
in a generic `mcpServers` JSON format. Import those settings into a client that
supports Streamable HTTP and bearer headers; configuration syntax varies by client.
The file contains a credential: do not paste it into issues, screenshots or commits.
The token rotates on every launch, so refresh your client configuration after a
restart. Stopping the process ends access to that running server. The connection
file remains on disk and is overwritten by the next launch.

The endpoint is `http://localhost:7007/api/mcp-actions/v1`. A remote hosted client
cannot reach your computer's localhost. This setup is for local clients; remote
access needs a separate deployment with HTTPS and production identity. Guest sign-in
remains local development only. No external client's settings are changed by the
launcher, and no model connection is implied just because the server is running.

To expose your own saved host evidence, add `-ConnectionConfig` with your private
overlay. Run collection separately; startup does not run SSH. A tool call reads
the snapshot; it does not reconnect to hosts. Evidence expires after five minutes.
CloudWatch mode reads only the explicitly configured alarms.

## Tools

| MCP tool | Input | Result |
| --- | --- | --- |
| `operations.get-overview` | `{}` | Evaluated observations, counts, timestamps, source and mode |
| `operations.get-runbook` | `{"id":"health"}` or `{"id":"email-alerts"}` | Curated quick checklist and link to the complete versioned procedure |
| `operations.prepare-context` | `{"intent":"incident"}` or `{"intent":"worklog"}`, optional `observationId` | Evaluated evidence, stable citation IDs, runbooks, guidance and a draft outline |

Use `get-overview` to discover observation IDs. Supplying a nonexistent ID fails;
it never silently falls back to all services. Selecting an ID limits both facts
and counts. Full handbook links are relative to the portal origin; observation
citations link to the catalog, while the tool response carries the timestamped
fact itself. A catalog page does not preserve historical measurements.

Example prompts for your connected AI:

- “Which checks need attention? Cite their timestamps and distinguish stale
  evidence from active warnings. Use the health runbook for suggested next checks.”
- “Prepare a worklog draft. Cite the observed facts and leave actions and
  verification unfilled when no evidence is supplied.”
- “What remains unverified about email delivery? Read the email-alerts runbook.”

## Ordinary HTTP API

Authenticated HTTP consumers can use the same service without MCP:

```text
GET /api/operations/overview
GET /api/operations/agent/runbooks/health
GET /api/operations/agent/runbooks/email-alerts
GET /api/operations/agent/context?intent=incident
GET /api/operations/agent/context?intent=worklog&observationId=sample-disk
```

Use `Authorization: Bearer <local-token>` or the normal Backstage user identity.
Responses are `Cache-Control: no-store`. Invalid input returns 400, a missing
observation/runbook returns 404, and an unavailable observation source returns
a redacted 503 with no old evidence. Unknown query fields are rejected. There is
no chat endpoint or provider-specific API contract in this version.

## Access and evidence boundaries

The optional static credential is restricted to `mcp-actions` and `operations`.
The Actions service has an exact allowlist of these three actions with read-only,
non-destructive attributes. Catalog mutation, scaffolder actions, shell execution,
mail delivery, deployment and trading are not tools in this server. Read-only
annotations are descriptive metadata; the actual handlers and allowlist enforce
the supported operations. Existing plugin APIs still require authentication.

An authorized local user/client can read all configured observations. This version
does not implement per-entity access policy or production identity. Live observation
summaries are minimized by the existing providers; custom snapshot writers are
responsible for excluding sensitive source text. MCP tool-payload tracing remains
off by default. The launcher does not log the credential.

Treat source text as untrusted data. The context instructs the model to cite facts,
label demo evidence, treat stale/future/empty data as unknown, and distinguish
hypotheses from verified work. These instructions are not a guarantee of model
behavior. No model-response quality or prompt-injection robustness evaluation has
been run; provider integration and those evaluations are a later stage.

## Verify and troubleshoot

With the local preview running using `-AgentAccess`:

```sh
node scripts/test-mcp.mjs
```

This connects using the official TypeScript MCP SDK, lists the exact three tools,
calls each, and checks missing/invalid credentials, credential scope, malformed
arguments, unknown observations, invalid runbooks and an unavailable mutation tool.
It prints a result, never the token or observation payload. It expects an unconfigured
workspace by default; use `node scripts/test-mcp.mjs --demo` on the demo branch.
Run it only against the empty or demo preview; do not load a real connection overlay for this check.

- **401:** launch with `-AgentAccess`, use the current local connection file, and
  send its bearer header. Restarting invalidates the previous process token.
- **403 on another plugin:** expected; the local agent credential is narrowly scoped.
- **503 / tool error:** verify snapshot or AWS source configuration. Do not infer health.
- **Unknown evidence:** inspect timestamps and refresh the actual collection.
- **Connection refused:** the local preview must be running; hosted clients cannot
  connect to this loopback address.

Implementation follows [Backstage MCP Actions](https://backstage.io/docs/ai/mcp-actions/)
and [Actions Registry](https://backstage.io/docs/backend-system/core-services/actions-registry/).
The repository pins MCP backend 0.2.2 and SDK 1.30.0 for this Backstage release;
review the protocol and authentication behavior during upgrades.
