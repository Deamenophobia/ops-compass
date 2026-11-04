# Applications and database dependencies

Enable **Service dependencies** in Workspace features, then open **Dependencies**.
Search the catalog and select an application or resource. The page combines a
Backstage dependency graph, direct **Depends on** and **Used by** lists, and the
entity's own available observations. Select **Focus** on a related entity to explore
its neighborhood, or follow its catalog link.

Main and existing saved feature choices keep this module off. A fresh demo workspace
enables it. Relationships persist in the registered catalog descriptors; the module
does not maintain a second relationship database or edit your deployments.

## Declare a relationship

Represent a database as a Backstage **Resource** with `spec.type: database`, and an
application as a **Component**. Add the database reference to the application's
`spec.dependsOn`:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: orders-api
spec:
  type: service
  lifecycle: production
  owner: platform-owner
  dependsOn:
    - resource:default/orders-database
---
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: orders-database
spec:
  type: database
  owner: platform-owner
```

Register the descriptor through your normal catalog configuration. Backstage
generates the reverse `dependencyOf` relation. The [complete synthetic example](https://github.com/Deamenophobia/ops-compass/blob/main/examples/dependencies-catalog.example.yaml)
adds a second consumer; main does not register it automatically. The model works for
a database container, an external managed database, a cache or another service.
Use stable logical names instead of ephemeral container IDs or IP addresses.

## Read the evidence correctly

- Every edge in this view is a **declared catalog relationship**. It is not proof of
  observed network traffic. A shared Docker network or namespace does not establish
  a dependency, and Compose startup order is not a complete traffic map.
- **Own checks** summarizes only observations whose `entityRef` matches that entity.
  The existing observation format supports Component and Resource references.
  A database has unknown health until an existing configured source supplies a check;
  selecting a database does not connect to it or run SQL.
- Critical and warning checks remain visible. Missing, stale, future or unavailable
  observations cannot become healthy. A mixed set of healthy and unknown checks is
  unknown. Timestamps and source labels accompany the selected entity's checks.
- Kubernetes readiness is shown separately when that module is enabled and its
  snapshot maps to the component. Readiness is not an end-to-end health verdict.
- A database failure indicates **potential impact** on its declared dependents. It
  never automatically changes the consumers' own status or claims a root cause.
- Graph colors identify entities, not health. The page uses Backstage's existing
  graph renderer. Only direct relationships are shown; follow neighbors or open
  Catalog Graph to explore further. Cycles do not trigger recursive impact analysis.

Health observations refresh every 30 seconds and expire in the browser between
polls. **Refresh** also reloads catalog details. Health failures clear old check
claims, while catalog declarations remain available independently. Kubernetes
retains its existing unknown-on-failure behavior and clears rejected access.

The catalog remains **shared across the trusted installation**. Observation data
is workspace-scoped and uses the existing authenticated Operations APIs; switching
workspaces clears previous results and ignores late responses. Disabling this module
hides its navigation and stops its requests. It does not disable the core catalog,
Catalog Graph or Operations APIs. Kubernetes is never requested when its own feature
is off. There is no new backend endpoint, credential store or permission bypass.

## Limits and demonstration

Catalog search returns up to 200 matches; narrow the search when there are more.
The detail lists resolve up to 40 direct relationships per direction and identify
unavailable catalog targets. The embedded graph is omitted above that limit.

On demo, select **Database dependency** in Workspace's scenario selector, then open
Dependencies and choose **Orders database**. Its synthetic failing check coexists
with the order service's synthetic passing check. This illustrates potential impact
without asserting that every consumer has failed. All names and signals are fictional.

Automatic network discovery, OpenTelemetry trace ingestion, SQL monitoring,
transitive failure propagation and orchestration are outside this first version.
An observed relationship would require a separate evidence source, observation
window and expiry policy; this page never invents one from declarations.

References: [Backstage entity descriptors](https://backstage.io/docs/features/software-catalog/descriptor-format/)
and [catalog relations](https://backstage.io/docs/features/software-catalog/well-known-relations/).
