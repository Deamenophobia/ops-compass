# Ops Compass user manual

Use **Operations** for current checks, **Workspace** for details and records,
**Catalog** for ownership, and **Agent access** for read-only context. The
[illustrated walkthrough](https://github.com/Deamenophobia/ops-compass/blob/demo/docs/guides/demo-gallery.md)
shows every function with synthetic data. Main starts empty.

Start with **Workspace features** to enable only the modules you need. Optional
modules are off in a new main workspace; demo initially shows them all. The
[feature settings guide](features.md) explains persistence, permissions and what
disabling each module stops. Disabled modules retain their saved records.

## Connect your own cloud or servers

Open **Connections** to prepare AWS inventory or multiple Linux SSH targets. The
[connection manual](connections.md) explains credentials, installation, collection
and verification. Drafting a configuration does not contact a server. Save a named
profile to retain it; use Edit, Disable or an explicit Test connection afterward.
Tests check access, not application health. Demo tests are always simulated, and
main requires administrator-approved targets before live tests are enabled.

## Services and containers

1. Follow [Workspace setup](workspace-setup.md) to configure named Docker containers
   and register their service entities in the catalog.
2. Run the SSH collector, then open **Workspace → Services** and select a service.
3. Review its host, environment, observation timestamp, image, revision, process
   state, health check, restart count and start time.
4. Open **Catalog and dependencies** or **Health runbook** for the next step.

Running describes a process; passing describes its configured health check. A
missing health check stays unknown. Expired evidence is not current health. The
collector omits logs, environment variables, process arguments and trading data.

### Bot and worker heartbeat

Configure a dedicated heartbeat JSON file written by the workload. Its `observedAt`
field must contain a current ISO timestamp with a timezone. The Services page checks
it against the configured age limit. A running container with an expired heartbeat
still needs investigation. An absent heartbeat is unknown. Collection never changes
or restarts the bot. Operations and the agent API use the same freshness rules.

### Pipeline and deployed version

Connect a GitLab project/ref using a backend read API token. Under **Pipeline and
deployed version**, follow **Open GitLab pipeline**, then compare its commit to
the containers' OCI revision labels. Missing revisions or old observations make
the comparison unknown. A successful pipeline or matching commit does not establish
that an endpoint works. These controls do not trigger pipelines or deployments.

## Operations history

Open **Workspace → History**. The collector records state transitions, source
failures/recovery and container version/restart changes. Repeated unchanged readings
do not add duplicates. Filter by event type or service; **Load older events** retrieves
the next page after the latest 100. Recording time and observation time are distinct.

**Refresh workspace** reads the configured sources and records changes. It does
not launch SSH. Run the SSH collector separately to update host evidence. Enabled
automatic notifications may be produced by this collection. Old timeline entries
remain historical even if current source collection fails.

## Worklogs

1. Select events in History and choose **Draft worklog from selection**, or open
   Worklogs and choose **Use latest 10 events**.
2. Enter a title and choose **Generate worklog draft**.
3. Review **Worklog Markdown**, including event IDs and timestamps. Fill in only
   actions you performed and outcomes you verified. The draft leaves these unclaimed.
4. Choose **Save reviewed worklog**.
5. Use **Read saved worklog** or **Download Markdown** from the saved list.

Drafting is deterministic and makes no model call. The saved record includes your
identity and selected evidence. Records stay private until you export/publish them.
The latest 100 documents are listed; saved documents retain their IDs.

## Email monitoring

Email starts disabled with blank recipients. After [provider setup](workspace-setup.md#email-providers):

1. Open **Workspace → Notifications** and select Resend or SNS.
2. For Resend, enter your recipient and verified sender. For SNS, manage recipients
   and confirm subscriptions in AWS; publishing sends to every subscriber of that topic.
3. Save settings. Enable automatic notifications only when this portal owns the
   notification route for those checks.
4. Choose **Send test email**. It is queued immediately; inspect progress as the
   background worker updates its status. Cancel waiting delivery if needed.
5. Check your inbox before choosing **I received this email**.

`Accepted` means provider acceptance, not inbox delivery. Receipt is a user
attestation, not automatic inbox access. `Uncertain` includes timeouts: inspect the
provider before another test. Resend may first show Retrying within its bounded
idempotency window; a final Uncertain status requires review. Tests are limited to
one per minute. All queue records are retained; the latest 100 are listed. See
[storage and delivery recovery](storage-and-delivery.md) for status and upgrade details.

Automatic messages report observed warnings, critical/unknown states and their
recovery. Unchanged conditions do not repeatedly email. The portal must stay running;
retain independent monitoring for critical workloads and avoid duplicate alert routes.

On demo, **Simulate email test** and its receipt confirmation make no external send,
even if provider credentials are present. Your real address is never a demo default.

## AWS costs and planning budget

Connect an existing named monthly AWS COST budget. **Workspace → Costs** shows
actual spend, forecast spend, limit and retrieval time. Missing or unavailable
spend stays unknown. AWS billing data is delayed; the configuration update time
does not describe when underlying usage was last refreshed.

Enter an amount and currency under **Your local planning budget**, then save. This
private preference changes the comparison in the portal; it does not create or edit
an AWS budget or notification. Different currencies are not converted or compared.
The meter highlights actual and forecast overruns when values are available.

## Maintenance, certificates and backups

Open **Workspace → Maintenance** and select a service:

- **TLS certificate** shows hostname, expiry and collection time. Fewer than 14 days
  remaining needs attention. Failed or expired evidence stays unknown.
- **Record a backup verification** records a restore or other verification you
  performed. Enter its actual time, next due time and supporting evidence, then
  choose **Record verification**. This form does not run a restore. A backup file
  or successful backup job alone does not establish restoreability.
- **Maintenance notes** saves service-specific text with your identity and time.

Backup records are user attestations. Verification cannot be future-dated, and the
next check must follow it. An overdue reminder remains until a new record is saved.

## Saved filters

On Operations, choose a search query and status, enter a **View name**, and select
**Save current view**. Apply it later from **Saved view** or remove it with
**Delete saved view**. Up to ten views are stored in that browser, scoped to your
identity and source mode. They are separate from server-side journal records.

## Demo scenarios

On demo, use **Workspace → Demo scenario**. Scenarios cover normal operation,
disk pressure, an unhealthy container, an expired heartbeat and a disconnected
collector. Their descriptions explain what should change or remain unknown. You
can select another scenario from Workspace even when collection is disconnected.

Main has no scenario fixtures. Shared code flows main → demo; the demo branch
contains the scenario files, sample catalog and illustrated manual.

## Storage, access and common problems

- Operations records persist in private SQLite files; demo uses a separate file.
  Restarts preserve them, and a branch switch does not publish them.
- Only identities in `opsCompass.writers` can save records, change scenarios or
  send tests. MCP service credentials cannot perform these writes.
- Provider secrets belong on the backend. GitLab SSH access does not provide the
  API token needed for pipeline metadata.
- Source failures clear current details while preserving historical records.
- Remote hosting still requires production identity, private storage permissions,
  database backup and deployment configuration. Defaults remain local-only.

See [Workspace design](../decisions/0003-workspace-journal.md) for technical boundaries.
