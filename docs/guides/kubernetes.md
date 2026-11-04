# Kubernetes observations

An optional, read-only page connects collected workload evidence to catalog
components: deployments, pod readiness/restarts, warning summaries and a link to
your cluster dashboard. It does not deploy, scale, delete, fetch logs, execute
commands or create a cluster.

## Try the synthetic example

On **demo**, start the portal normally and open **Kubernetes**. For an existing
journal, enable **Kubernetes observations** in **Workspace features** first. New
demo journals enable it automatically; main and upgraded journals keep it off.
The example includes a progressing deployment and an unready pod. It is labelled
synthetic and its observation time is replayed on each read.

## Connect your own cluster

1. Copy `examples/kubernetes.example.json` to `private/kubernetes.json`. Set the
   HTTPS API origin, cluster name, namespace, label selector and catalog component
   reference. Set `tokenFile` to a private bearer-token file and `caFile` to the
   cluster's PEM CA certificate. Omit `caFile` only when system trust validates the
   server. An optional HTTPS `dashboardUrl` links to your separately managed dashboard.
2. Obtain a credential with the namespace permissions below through your existing
   cluster administration process. Keep credentials outside version control. Token
   expiry and rotation remain the operator's responsibility.
3. From the repository root, explicitly collect a snapshot:

   ```sh
   python scripts/collect-kubernetes.py --config private/kubernetes.json --output private/kubernetes-snapshot.json
   ```

4. Add this to your private backend overlay, then restart with that overlay using
   the [local setup guide](local-setup.md):

   ```yaml
   opsCompass:
     kubernetes:
       file: ../../private/kubernetes-snapshot.json
       maxAgeSeconds: 300
     features:
       defaults:
         kubernetes: true
   ```

5. Enable **Kubernetes observations** in **Workspace features** if choices have
   already been saved. Open **Kubernetes** and check source, coverage, timestamp
   and service mapping before interpreting the results.

Collector paths are relative to the shell's working directory; backend paths are
relative to `packages/backend` in the standard local launcher. Absolute paths also
work. The portal receives only a snapshot path, never the cluster token or collector
configuration. Keep the workspace mode outside `demo` for actual API snapshots.

For [team workspaces](workspaces.md#connect-workspace-specific-sources), place
`kubernetes` and initial `features.defaults` under the matching
`opsCompass.workspaceSources[].settings`. New workspaces inherit no other workspace's
files or credentials. Membership and feature admission guard the API and page;
catalog entities themselves remain shared.

## Namespace permissions

A cluster administrator binds a namespace Role to the collector identity. These
are the required rules, not an automatically applied manifest:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ops-compass-observer
  namespace: example-apps
rules:
  - apiGroups: [apps]
    resources: [deployments]
    verbs: [list]
  - apiGroups: ['']
    resources: [pods, events]
    verbs: [list]
```

Bind only required namespaces. Label selectors reduce collection; they are **not**
an RBAC boundary. Listing pods can expose specifications to the collector process
even though the snapshot excludes them. Do not grant secrets, logs, exec or write
permissions for this feature. See [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/).

The collector supports HTTPS origins, bearer tokens and optional CA files. It does
not load kubeconfig, run credential plugins, follow redirects, use environment
proxies or bypass TLS verification. EKS/GKE/AKS credentials requiring exec plugins
must be obtained and refreshed separately; an AWS CLI profile alone is insufficient.

## Mapping and interpretation

Each target has a cluster, namespace, catalog `component:namespace/name` and explicit
label selector. Label both Deployment metadata and Pod templates consistently;
Deployment selectors are not automatically expanded. Ensure the catalog component
exists. A service may have targets across clusters; duplicate cluster/namespace/component
targets are rejected. Dashboard URLs cannot contain credentials, query or fragment.

- Deployment status uses desired, ready, available and updated replicas, controller
  generation, pause state and failure conditions. Scaled-down deployments are separate.
  Readiness does not prove end-to-end application health.
- Pods distinguish ready, not-ready, completed, failed and terminating. Restarts sum
  reported regular and init-container counts; missing counts are unknown.
- Warnings include only events whose involved-object UID matches a selected pod or
  deployment. Raw messages, annotations, specs and environment values are omitted.
  ReplicaSet and other controller events are not included.
- Coverage is independent for deployments, pods and events: `available`, `unauthorized`
  (401), `forbidden` (403), `tls-error`, `unavailable`, `invalid` or `limit`.
  The page explains credential, permission, certificate and collection failures.
  Empty evidence is not a healthy verdict.
- Expired or significantly future-dated snapshots have unknown current workload
  status. Counts and events remain historical observations.

Refresh and the page's 30-second poll reread the saved file; neither contacts a
cluster. Rerun the collector for new evidence. There is no built-in scheduler,
watch stream, history store, alert integration or Kubernetes MCP action.

The page retains the last snapshot while refreshing. Failed refreshes and expired
evidence show unknown current status; a successful refresh recovers normally.
An authentication or access rejection clears the previous observations. Changing
workspaces cannot display a late response from the previous workspace. Search
shows an explicit message when no service matches.

The first version supports up to 20 targets, 100 items per resource list, 1 MiB per
API response, 4 MiB per snapshot and a five-second socket timeout per request.
Collection is sequential. Continuation tokens or list limits mark that resource
`limit` and discard its partial list; narrow the selector or namespace. Warning
events are listed across the namespace before UID filtering, so busy namespaces
may exceed this limit even for a small service. Partial failures save explicit
coverage and return exit code 2. Configuration/output failures leave the previous
snapshot unchanged; check its age. Snapshot publication is atomic.

Only Deployment summaries are implemented; pods from other controllers can appear
when they match. StatefulSet, DaemonSet and Job summaries, cluster discovery, node
metrics and orchestration are outside this feature.

## Design references

The service view follows [Backstage Kubernetes](https://backstage.io/docs/features/kubernetes/)
and [Deployment status semantics](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/).
Ops Compass uses its own snapshot adapter to preserve explicit collection, workspace
source isolation and existing permissions. The stock Kubernetes plugin is not
installed. Use a separate tool such as [Headlamp](https://headlamp.dev/) for cluster
administration or [Argo CD](https://argo-cd.readthedocs.io/en/stable/) for GitOps delivery.

See the [verification record](../releases/kubernetes.md) for tested behavior and limits.
The [release preparation guide](release-preparation.md) includes a disposable local
cluster rehearsal for checking TLS, RBAC and real Kubernetes API compatibility.
