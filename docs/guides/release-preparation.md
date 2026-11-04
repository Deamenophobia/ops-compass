# Release preparation

The workspace, Kubernetes and declared-dependency update is a reviewed source
preview. GitHub publication is a separate step; these checks do not themselves
publish, create tags or activate CI.

## Rehearse an upgrade

Install dependencies and build the frontend in two separate checkouts: the currently
published version and this candidate. Run from the candidate:

```sh
node scripts/verify-public-upgrade.mjs --previous-root /path/to/published/ops-compass
```

The script starts the actual published and candidate backends on temporary loopback
ports, with synthetic data in a new ignored `private/upgrade-check-*` directory.
It saves notes, a budget preference and feature settings through the old HTTP API,
backs up the journal, upgrades it, and checks preservation and workspace isolation.
It then checks restart, restored candidate data and rollback using the **pre-upgrade
backup** with the old application. It never runs the old application against the
upgraded database. Each child backend stops when the script finishes.

Use `--python /path/to/python` if Python is not on PATH. Inspect `result.json` and
the private logs. This is a compatibility rehearsal, not a backup of your actual
installation. Preserve its configuration and database separately before upgrading.

## Rehearse a real local Kubernetes collection

Install [kind](https://kind.sigs.k8s.io/docs/user/quick-start/), kubectl and a working
local Docker engine. On Windows, Docker's Linux engine requires working virtualization
and WSL2. No cloud account is needed. This opt-in check downloads public container
images and briefly runs one local cluster:

```sh
python scripts/verify-kubernetes-kind.py
```

Use `--kind`, `--kubectl`, `--docker` for executable paths, and `--docker-context`
for a local context. The script refuses remote Docker endpoints. It creates a unique
cluster name, binds the API to loopback and uses an isolated kubeconfig under
`private/kind-check-*`; it never changes the default kubeconfig or Docker context.

Checks include a ready sample Deployment/Pod, a synthetic warning Event, trusted
TLS, missing Event RBAC permission, a rejected token and an untrusted CA. Credentials
are not printed. Cleanup removes only the generated cluster. If cleanup fails,
use its generated name and kubeconfig from that private directory to remove it.
The saved snapshot contains only the collector's sanitized fields.

**Current status:** the script's local-engine preflight was attempted on 4 November
2026. Docker was unavailable and WSL2 reported disabled virtualization. No cluster
was created; the integration stages remain unexecuted. Unit tests cover response
mapping but do not substitute for a real cluster test. Run this rehearsal on a
machine with a working local container runtime before publishing that claim.

## Publication checks and remaining integration work

- The fresh [dependency audit](../releases/dependency-review.md) has 13 findings,
  including two high and none critical. The high paths and Zod compatibility
  limitations have an explicit local-preview assessment; they are not waived for
  hosted production use.
- Complete the local cluster rehearsal above on a capable host before claiming
  real Kubernetes integration validation. Its blocked status is included in the
  public preview notes; synthetic tests alone do not clear this gate.
- Export reviewed committed source into a separate directory, install with
  `yarn install --immutable`, and review the manifest and synthetic captures.
- Publish only after the candidate and these limitations have been reviewed.

The README stays focused on core features; setup, verification and limitations
belong in this handbook.
