# Code walkthrough and maintenance notes

Read this after [Architecture](../architecture.md). Inline comments explain local
decisions; this page explains how the files work together.

## Follow a dashboard request

1. `packages/app/src/App.tsx` installs the catalog, sidebar, theme and operations
   plugin. `plugins/operations/src/plugin.tsx` declares the custom operations,
   workspace, inventory and agent routes.
2. `OperationsPage.tsx` asks Backstage discovery for the operations API location.
   Its authenticated fetch API supplies the user identity; the page does not handle
   a secret or hardcode a production backend URL.
3. `plugins/operations-backend/src/index.ts` selects the configured provider,
   registers MCP actions and mounts `router.ts` inside Backstage authentication.
4. `agent.ts` owns the shared evidence service. It calls the provider and the common
   evaluator, and redacts source exceptions before HTTP or MCP can return them.
5. `plugins/operations-common/src/index.ts` validates the snapshot, checks age and
   clock drift, and computes effective states and counts.
6. The page validates the response before displaying it. Refresh runs every 30
   seconds, and a request times out after 15 seconds. Cleanup prevents a late reply
   from replacing a newer result. A failed source clears the previous cards.

## Health rules worth preserving

`reportedState` records what the source said. `state` is the state currently safe
to display. Expired evidence and timestamps more than one minute in the future
become unknown. An empty collection also means unknown. A known critical check
remains critical even when another check is unknown; missing data must not hide
an observed failure. These rules are shared by the frontend and agent responses.

## Source adapters

- `unconfigured` returns no observations and source `none`, so first launch stays unknown.
- `demoProvider` replays an explicitly configured synthetic JSON fixture, preserving
  relative observation ages. The fixture and sample catalog live only on `demo`.
  SSH and CloudWatch timestamps are never shifted.
- `fileProvider` reads only the backend-configured snapshot file, bounds its size
  and validates it on each read. HTTP/MCP clients cannot choose a filesystem path.
- `cloudWatchProvider` reads named metric alarms, bounds pagination and rejects an
  incomplete response. Observation time is the successful read time. AWS's state
  transition time is preserved separately, since an unchanged alarm can still have
  been observed recently. Raw alarm reasons are intentionally omitted.
- `scripts/collect-ssh.py` validates aliases and sends one fixed read-only program
  over SSH. It reduces results to a small schema and replaces the output atomically.
  A running Docker process without a passing health check remains unknown.

## Follow an agent request

`actions.ts` registers the three native Backstage actions. `app-config.yaml` defines
which exact action IDs may be exposed. Their read-only annotations help clients,
but the fixed handlers and allowlist define their actual capabilities.

`createEvidenceService().context()` assembles evidence, citations, quick runbooks
and an outline. It never calls a model, writes a worklog or runs a command. When
one observation is requested, it scopes counts as well as facts. Unknown IDs fail
rather than silently broadening the request. Backstage's recognized error classes
keep missing/unavailable evidence understandable to MCP clients.

`AgentPage.tsx` previews one captured response. Changing the purpose clears the
old preview. Explicit refresh clears it before fetching, so a failed request cannot
leave stale context looking newly generated. Source text remains untrusted data;
model-response quality and injection resilience require separate evaluation.

## Follow a workspace update

`WorkspacePage.tsx` composes six feature panels from `workspace/`. The shared
`useWorkspaceModel.tsx` hook owns loading, selections and mutation feedback. Each
panel keeps its form and explanation together; `presentation.ts` holds styles and
evidence descriptions. `useOperationsApi.ts` supplies authenticated, bounded requests.

`workspaceRouter.ts` checks a real user principal against `opsCompass.writers`
before any mutation. `store.ts` serializes state transitions and uses database
transactions for a document with its journal event. `workspace.ts` coordinates
collection, duplicate suppression, drafts and notification attempts. `integrations.ts`
isolates GitLab, AWS Budgets, SNS and Resend. Their errors are redacted at the API
boundary, and provider acceptance never proves inbox receipt. Tests exercise those
boundaries, reopened storage and unavailable evidence.

`migrations.ts` embeds immutable, numbered storage upgrades. `outboxStore.ts` stores
delivery intent alongside a transition transaction, without exposing private message
payloads in progress APIs. `notificationWorker.ts` claims work and applies the bounded
retry policy from `delivery.ts`. The worker has its own timer and runs independently
of the collector. The notification panel polls database progress without calling
provider APIs or replacing unsaved form inputs. See [storage and delivery](storage-and-delivery.md).

`collect-services.py` supplements the existing collector only for explicitly named
containers. The fixed Docker format excludes environment variables and logs. A
heartbeat has its own expiry; a running container cannot keep an expired heartbeat
healthy. The common evaluator derives the same service checks for dashboard and MCP.

## Change the appearance

`packages/app/src/theme/softTheme.tsx` defines the shared Material UI/Backstage theme.
`soft.css` aligns the newer Backstage UI tokens and keyboard focus. Page layout
lives beside each custom page. `CompassMascot.tsx` is a decorative, scalable SVG;
it does not encode status or connect to any external image service.

Keep labels, inputs, focus indicators and health distinctions accessible. Use
the [frontend design guide](frontend-design.md) when changing colors or layouts.

## Where to verify a change

`docs/mkdocs.yml` owns the handbook navigation. The root `mkdocs.yml` inherits it
so the existing root build command still works. The catalog's TechDocs reference
points to `docs/`: generation validates only documentation inputs, avoiding scans
of dependencies, private runtime files and changing browser-test artifacts.

Type checking already enables `noUnusedLocals` and `noUnusedParameters` through
Backstage's shared TypeScript configuration. Run the root `tsc` and `lint:all`
commands when changing source. Check references before deleting exported symbols,
public assets or scripts; compiler checks cannot establish that every export is used.

The app uses `app.packages: all`, so Backstage discovers frontend plugins from
dependency metadata. Catalog graph, TechDocs, authentication and other plugin
dependencies can be active without imports in `App.tsx`. Database drivers, React
peers, CLI tools and `config.d.ts` also have framework-managed entry points. Review
those paths before pruning a dependency, update the lockfile with Yarn, then build
and walk through the affected routes. Avoid adding a package for hypothetical future use.

The shared `workspaceFeatures` list also sets workspace tab order. Add a workspace
module there instead of keeping another frontend list. In the sidebar, reserve
settings items before calling `nav.rest()`; that call consumes remaining items.
Feature switches stage edits locally, and Reload replaces the staged choices.

| Change                          | Relevant check                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Health contract or freshness    | Common package Jest tests and backend tests                                          |
| Source provider or API          | Provider/router tests, including unavailable data and authentication                 |
| MCP action or credential setup  | `node scripts/test-mcp.mjs` against the local agent preview                          |
| React flow, theme or navigation | Type checking, lint, frontend build and browser walkthrough at desktop/mobile widths |
| Collector                       | Python unittest; separate authorized real-host collection when necessary             |
| Manual or navigation            | Strict MkDocs build and the affected TechDocs page                                   |

Commands and prerequisites are in [Local setup](local-setup.md). Verification
records belong in the worklog. A comment explains intent; a test supplies evidence
that the important behavior still holds.
## AWS, delivery and model boundaries

`ConnectionsPage.tsx` holds a temporary draft in React state. The common
`connections.ts` schema validates targets and serializes collector-compatible
JSON plus a portal overlay. Editing discards the prepared export. Commands are
fixed strings; form values are never interpolated into shell commands. Preparing
a draft neither contacts a provider nor installs active configuration. Starting
the portal is separate from running a collector. The separate `SavedConnections`
panel persists reviewed profiles through owner-only APIs. `ConnectionService` uses
the versioned `connections-v1` journal state key, serialized updates and revision
checks; late tests cannot update a changed profile. `ConnectionProbe` enforces a
backend target allowlist before fixed, bounded CLI/SSH probes. Demo returns simulated
results before any subprocess. Startup recovers running records as interrupted.
See [Connections](connections.md) for limits and deployment prerequisites.

`InventoryPage.tsx` reads the authenticated inventory endpoint. The common inventory
schema validates identities and freshness; the backend rejects a snapshot whose
source conflicts with demo mode. `collect-aws.py` writes selected fields atomically
and keeps SSH metadata separate from AWS account API coverage.

`sandbox-release.py` manages one labeled, resource-limited container. It records
intent before replacement and verifies the actual image and endpoint revision.
`aws-release.py` checks account and target tags before one SSM dispatch; its record
separates requested parameters from the host's observed release, including rollback.
The Terraform and inactive CI examples configure transport without enabling it.

`journal-backup.py` uses SQLite's online backup API and verifies checksums before
restoring to a new path. `agent-model.mjs` gates evidence before any provider call
and validates response citations; `ask-agent.mjs` supplies MCP transport and private
file output. Provider keys remain outside the portal.

`features.ts` in the common package defines optional modules and their contract.
The backend `FeatureService` persists versioned workspace choices; its router
blocks disabled APIs, and workers consult the same state before optional activity.
Disable handlers drain notification work or cancel connection tests while retaining
records. MCP checks the flag on every action, independently of HTTP route guards.
The app's root `FeatureProvider` shares one settings read across navigation and
pages. Gates unmount disabled screens; workspace panels only fetch enabled data.
No feature switch supplies credentials or starts an external collector.
