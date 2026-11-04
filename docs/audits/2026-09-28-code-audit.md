# Code audit — 28 September 2026

The package structure is suitable for a small portal, but existing passing tests
did not establish correct routing. This focused source review found the defects
below and added repairs and regressions. It is not a penetration test or a claim
that every code path has been exercised.

## Findings and repairs

| Priority | Finding and effect before repair | Repair |
| --- | --- | --- |
| P1 | Role selection used a case-sensitive URL expression; Express handlers match without case sensitivity. A regular member could reach administrator actions using `/Budget-Preference/` or `/NOTIFICATIONS/settings`. Authentication and workspace membership were still required. | Declare `admin` or `contribute` on each mutation handler. |
| P1 | Feature admission used a case-sensitive path segment. `/Connections/`, `/INVENTORY` and `/Agent/context` could reach disabled features. | Mount guards with Express paths, using the handlers' matching rules. |
| P2 | The feature router parsed every JSON body at 16 KiB before worklog routes. Valid 20,000-character worklogs failed with 413; the previous 64 KiB parser also could not fit 32,000 Chinese characters. | Scope parsers to their routes. Worklogs allow 256 KiB for UTF-8/JSON escaping, retaining the 32,000-code-unit schema limit. Feature settings retain 16 KiB. |
| P2 | Directory polls and manual refreshes could finish out of order. A late poll could undo selection of a newly created workspace; an old failure could erase newer data. Failed reads retained a stale directory for selection callbacks. | Apply only the current request generation, invalidate on cleanup, clear the directory on failure, and prevent polls superseding manual reads. |
| P2 | Operations links hard-coded page paths. App path overrides changed sidebar links but left links inside pages pointing at old paths. | Resolve shared native Backstage route references and omit unavailable targets. |
| P3 | The browser flow exposed duplicate page headings: the native page wrapper and the themed legacy page both supplied a header. | Use `PageBlueprint`'s native `noHeader` option where the page already owns its header. |

Eight new backend regression cases and four frontend race/cleanup cases failed
before the repairs. The worklog records final verification results.

## Readability, structure and comments

- **Structure:** browser contracts belong in `core`, membership/storage/policy in
  `core-node`, React workspace UI in the core frontend plugin, and providers in
  operations. Core packages do not import operations feature packages.
- **Imports:** a static scan of 73 production TypeScript files found no cycles
  among the relative/workspace imports it resolved. This is not exhaustive runtime
  dependency analysis.
- **File sizes:** the connection form is roughly 480 lines; workspace management
  roughly 300. Existing operations panels are already split by feature. Extract
  AWS/SSH form sections when they gain behavior; a wholesale folder rewrite is
  unnecessary for these repairs.
- **Nesting:** the provider order is meaningful. `WorkspaceProvider` wraps feature
  state, and identity/workspace keys reset page state on selection changes. Most
  deep JSX handles loading, membership and administrator controls, rather than
  deeply nested business logic.
- **Cleanup:** removed six ineffective `where` clauses directly before inserts.
  The inserted values already include `workspaceId`. TypeScript checks unused
  locals/parameters; lint remains enabled. Dynamic page imports and plugin entry
  points should not be deleted based only on text-reference counts.
- **Comments:** existing notes explain freshness, atomic snapshot writes, retry
  uncertainty, credential boundaries and runtime ownership. New comments explain
  matching rules, parser limits and response ordering. Line-by-line narration
  would add noise. Cross-file explanations belong in the
  [code walkthrough](../guides/code-walkthrough.md), keeping the README short.

## Routing

The chain is Backstage authentication → directory or selected-workspace access →
feature admission → endpoint capability/validation → scoped store or provider.
`/workspaces` manages the directory; `/workspace` is the operational workspace.
Native Backstage permission integration stays outside selected-runtime middleware.

Page references live in `plugins/operations/src/routes.ts`, separate from the
plugin factory to avoid lazy-page import cycles. The app can override operations
page paths; internal links follow those references.

## Remaining limits

- Catalog and TechDocs are shared. This is operational workspace separation, not
  complete multi-tenant Backstage hosting.
- SQLite, in-process write queues and workers assume one backend instance.
- Catalog/handbook links still assume `/catalog` and `/docs`. Customizing those
  mounts needs native external route bindings as a separate change.
- Directory listing checks at most 100 workspaces sequentially. Batch permission
  checks if measured latency warrants it; no performance claim is made here.
- Live OAuth, AWS and email require each installation's configuration and testing.
  Local synthetic checks do not verify those systems.

## Official references

- [Backstage route references](https://backstage.io/docs/frontend-system/architecture/routes/)
- [Backstage PageBlueprint options](https://backstage.io/api/stable/variables/_backstage_frontend-plugin-api.index.PageBlueprint.html)
- [Backstage permissions service](https://backstage.io/docs/backend-system/core-services/permissions/)
- [React effect cleanup and fetching](https://react.dev/reference/react/useEffect)
