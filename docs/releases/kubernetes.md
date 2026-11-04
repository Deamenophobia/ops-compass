# Kubernetes observations verification — 4 November 2026

The optional module adds explicitly collected, workspace-scoped Kubernetes evidence.
See [setup and limits](../guides/kubernetes.md). This is observation, not orchestration.

Verified locally with synthetic fixtures and mocked Kubernetes responses:

- 120 application tests across 24 suites for the combined update, including workspace membership, feature
  admission, source isolation, stale snapshots and compatibility with saved settings.
- 28 Python collector/client tests and 8 public-export checks.
- Type checking, repository lint, frontend/backend builds and strict handbook build.
- Browser walkthrough: synthetic deployment/pod/warning display, service filtering,
  snapshot refresh, feature disable and direct-route gating, then re-enable.
- Release-preparation walkthrough: explicit empty search, retained observations
  marked unknown after invalid-file refresh, successful recovery, and narrow layout.
- Actual published application (`f667789`) to candidate upgrade with synthetic
  notes, budget and feature choices; ownership migration, a separate workspace and
  membership; restart; restored candidate backup; pre-upgrade rollback to the old
  application. The new Kubernetes feature stays disabled for saved settings.

No cloud credentials, alert delivery or CI pipeline was used. The disposable local
cluster rehearsal could not proceed: Docker returned no usable engine and WSL2
reported disabled virtualization. No working test cluster was created. TLS behavior
is covered with mocked responses, not a completed real-cluster connection.

The [rehearsal scripts and release checks](../guides/release-preparation.md) make
these checks repeatable. The fresh [dependency audit](dependency-review.md) has
13 remaining findings, including two high and none critical, with an explicit
local-preview assessment. This source preview does not claim real-cluster or
production validation. The local-engine preflight was retried before publication
and remained blocked; no cloud or existing cluster was used as a substitute.
