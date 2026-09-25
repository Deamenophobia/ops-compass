# Ops Compass Handbook

Ops Compass connects a Backstage catalog to timestamped operations evidence.
Start with [local setup](guides/local-setup.md), then [choose the features](guides/features.md)
you need. Main opens a minimal workspace. Enable [connections](guides/connections.md)
when you are ready to configure your own sources.

The portal provides a Backstage frontend and backend, a configurable service
catalog, optional demo-branch observations, an SSH snapshot collector, and a read-only adapter for
named CloudWatch metric alarms. The [Agent access interface](guides/agent-access.md)
adds read-only MCP tools and a context preview for a model supplied by your client.
Deployment scripts and an optional external model client are documented separately;
the portal does not automatically deploy resources or call a model.

The [user manual](guides/user-manual.md) covers the persistent Workspace: containers,
worker heartbeats, pipeline comparison, history, reviewed worklogs, configurable
email, AWS costs, certificates, backup verification and maintenance notes. Connect
your own providers with [Workspace setup](guides/workspace-setup.md). Main starts
empty; the [illustrated demo](https://github.com/Deamenophobia/ops-compass/blob/demo/docs/guides/demo-gallery.md)
walks through synthetic examples without touching real workloads.

## Understand the display

- **Demo workspace:** synthetic examples. No AWS connection.
- **Collected host observations:** saved SSH evidence, subject to expiry.
- **AWS CloudWatch observations:** configured alarm states retrieved using AWS SDK credentials.
- **Unknown:** missing, stale, future-dated, or insufficient evidence. Never equivalent to healthy.

The status is per observed check, not a guarantee that an entire application works.
An alarm in OK state also says nothing about inbox delivery.

Use the [health runbook](runbooks/health.md) when a check needs attention and the
[email guide](runbooks/email-alerts.md) when verifying notification delivery.
Record observations and verified outcomes in the worklog.

For technical background, read [Architecture and stack](architecture.md), the
[code walkthrough](guides/code-walkthrough.md), and [frontend design](guides/frontend-design.md).
The README is intentionally limited to getting started and everyday usage.

The [public preview notes](releases/preview.md) record verification,
known limitations and the public release scope.
