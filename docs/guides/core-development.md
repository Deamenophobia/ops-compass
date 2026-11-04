# Extend the modular core

The application uses Backstage's plugin model. Add packages with the Backstage CLI,
register backend plugins with `backend.add(...)`, and add frontend plugins through
`createApp({ features: [...] })`. Consult the
[official plugin architecture](https://backstage.io/docs/backend-system/architecture/plugins/)
before introducing another abstraction.

| Package | Responsibility | Depends on operations? |
| --- | --- | --- |
| `@ops-compass/core` | Workspace contracts, roles and permission definitions | No |
| `@ops-compass/core-node` | Directory storage, access adapter and Backstage policy module | No |
| `@ops-compass/plugin-core` | Workspace context, selection and administration UI | No |
| `@ops-compass/operations-common` | Health, feature and operational data contracts | Domain package |
| `@ops-compass/plugin-operations-backend` | Workspace-scoped providers, routes, journal and jobs | Feature plugin |
| `@ops-compass/plugin-operations` | Optional operations pages | Feature plugin |

## Request path

1. The frontend core resolves the signed-in user's workspace directory.
2. The app mounts feature/page state keyed by identity and selected workspace.
3. Operational clients attach `X-Ops-Workspace` to requests.
4. The backend validates the ID and asks `coreServices.permissions` to authorize
   the authenticated user against the workspace resource.
5. Backstage evaluates the policy's membership condition using the permission
   resource registered by the operations plugin.
6. The selected runtime invokes its own routes, clients and scoped store. Write
   routes additionally require `contribute` or `admin` permission.

Only the backend decides access. Navigation hiding and disabled buttons explain
capabilities; they are not access-control boundaries.

## Add a feature

Keep provider-specific code in the feature package. Use core's exported workspace
contracts and Backstage services. In the operations plugin, use its existing
`OperationsStore` instance rather than constructing unscoped database queries or
sharing mutable clients across workspaces. New background tasks must belong to a
workspace runtime and stop during shutdown. Feature flags must govern backend
routes and background work as well as UI visibility.

For a separate backend plugin, define its own permission resource/integration
through Backstage rather than reading another plugin's private tables. The current
workspace resource belongs to the `operations` host plugin; these internal core
packages are not a generic cross-plugin tenancy service. Introduce a documented
service boundary when another backend plugin actually needs membership data.

Test two identities and two workspaces, including forged resource IDs, disabled
features, stale revisions and shutdown/restart. Keep provider credentials in
backend configuration. A workspace ID is a selection parameter, never a secret.

## Routing and cleanup

Write handlers declare `admin` or `contribute` directly. Feature admission uses
Express path matching, and each router scopes its JSON parser to its own paths.
A small settings parser must not intercept a larger worklog request. Test case
variations, trailing slashes and UTF-8 payloads through the complete router stack.

Use the native references in `plugins/operations/src/routes.ts` for links between
operations pages; the app can override their paths. `OperationsLink` wraps
Backstage's `useRouteRef` and omits an unavailable target. Keep references outside
the plugin factory to avoid circular imports from lazy-loaded pages.
Pages that render their own themed Backstage `Header` set `noHeader: true` on
`PageBlueprint` to avoid duplicating the framework's default page header.

Directory refreshes use a request generation: an older success or failure cannot
replace newer membership data. Polling must not supersede a manual refresh after
workspace creation. Cleanup invalidates responses; failed reads clear the directory
used by selection callbacks. Backend authorization independently checks every request.

## Replace a policy

`packages/backend/src/index.ts` installs the permission backend and the exported
`workspacePermissionModule`. Replace that module with your own Backstage backend
module using `policyExtensionPoint`; do not register two policies. Reuse the core
permissions and exported membership condition where appropriate. The default policy
allows authenticated users to use shared catalog/TechDocs permissions and limits
operational records to explicit membership. Organizations needing stricter catalog
permissions must supply and verify that policy themselves.

Core is versioned together with the app. Keep browser contracts in `core`, server
dependencies in `core-node`, and React code in the frontend plugin. Independent npm
publication, a custom module loader and separate personal/team code forks are not
needed for this release.
