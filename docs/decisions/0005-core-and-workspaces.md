# Core packages and optional team workspaces

Status: accepted for the next preview; public v0.1.0 remains the previous release.

## Decision

Keep one application in this repository. Extract browser-safe workspace contracts
into `@ops-compass/core`, server-side membership and permission integration into
`@ops-compass/core-node`, and workspace selection/administration into
`@ops-compass/plugin-core`. Operations remains a feature plugin that consumes these
packages. Core does not depend on AWS, email providers or operations UI components.

Use Backstage's existing backend plugins, modules, core services, permission
registry and permission-policy extension point. Use its frontend plugins and root
wrapper blueprint. Do not introduce a second plugin loader, login system, token
format or dependency-injection container. Core packages are internal Yarn
workspaces, not separately published npm products.

`opsCompass.profile` selects `personal` (default) or `team` for the installation.
Personal uses the stable `personal` workspace. Team enables creation and explicit
administrator/user memberships. Roles belong to each workspace: creating another
workspace does not grant access to existing ones. A UI choice never changes roles.

The operations backend owns the `ops-compass-workspace` permission resource and
registers it through `coreServices.permissionsRegistry`. The policy uses native
conditional decisions to check membership. Deployments can replace the exported
policy module with another Backstage permission module; exactly one policy should
be installed. Permission enforcement is mandatory for both profiles.

## Isolation and upgrade

Scope operational settings, events, documents, connections and notification jobs
by workspace ID. Each runtime owns its provider clients, caches and workers.
Additional sources require an explicit `opsCompass.workspaceSources` entry; they
cannot inherit the personal workspace's paths, credential references or routes.
Migrate existing records into `personal`; never discard the old journal. Seed its
administrators from `opsCompass.writers` once, without re-adding removed members on
restart. Use revision checks for membership/name changes and preserve one admin.

The catalog, search and TechDocs remain shared within one trusted installation.
This is operational workspace separation, **not full Backstage multi-tenancy**.
Separate installations are appropriate for mutually untrusted organizations.
This preview retains the existing single-backend deployment constraint.

## Releases

Use `main` for shared code and `demo` for the same code plus synthetic content.
Use short-lived feature branches. Personal and team are configuration profiles,
not permanent release branches. Version core and feature packages together for
now. Preserve v0.1.0 and prepare the next compatible upgrade as v0.2.0-alpha.1;
publish only after the release checklist passes. GitLab remains the development
home; GitHub receives reviewed exports.

## Official references consulted before implementation

- [Backend plugins](https://backstage.io/docs/backend-system/architecture/plugins/),
  [modules](https://backstage.io/docs/backend-system/architecture/modules/) and
  [extension points](https://backstage.io/docs/backend-system/architecture/extension-points/).
- [Permission framework](https://backstage.io/docs/permissions/overview/),
  [policy modules](https://backstage.io/docs/permissions/writing-a-policy/) and
  [resource permissions](https://backstage.io/docs/permissions/plugin-authors/03-adding-a-resource-permission-check/).
- [Sign-in identity resolvers](https://backstage.io/docs/auth/identity-resolver/)
  and [frontend plugins](https://backstage.io/docs/frontend-system/architecture/plugins/).

Installed Backstage 1.55 package types were checked against these APIs. The
permission backend uses the version in that release's official package manifest.
