# Illustrated user manual

This gallery walks through the working features in Ops Compass. Screenshots use
synthetic data on **demo**; they do not show real AWS resources, spend, bot activity,
email delivery or restore results. The production sign-in screen uses dummy OAuth
configuration and does not show a completed login. Follow the [user manual](user-manual.md) for daily
use and [Workspace setup](workspace-setup.md) to connect your own services on **main**.

The feature settings illustrations (37–39) show the latest navigation cleanup.
Earlier screenshots retain their capture dates in `capture.json`; follow
the current written steps when a menu position differs.

## Start the right branch

Stop the portal before changing branches. `main` starts empty; `demo` adds the
sample catalog, scenario files and this gallery. Shared application changes flow
from main into demo. Their private journal databases are separate.

```powershell
git switch demo
node .yarn/releases/yarn-4.13.0.cjs install --immutable
.\scripts\start-local.ps1
```

For the built preview at port 7007, follow [Local setup](local-setup.md). Choose
**Enter**, then use the sidebar to move between Operations, Workspace, Catalog,
Docs and Agent access. The [branch guide](repository-workflow.md) explains updates.

## 1. Review current operations

Open **Operations**. Read the source label, collection time and counts before
acting. Container checks, heartbeats and TLS checks use the same evaluator as the
agent API. A stale successful observation is **unknown**, not a current success.

The default Disk pressure scenario shows an 84% example disk, a certificate due
soon and a stale backup observation. Every value is synthetic.

![Operations overview](../screenshots/01-operations.png)

## 2. Filter and save a view

Choose **Status → Needs attention**, enter `disk` in **Find a check or service**,
then enter `Disk review` as the **View name** and click **Save current view**.
After a reload, select it under **Saved view** to restore the query and status.
**Delete saved view** removes it. Views belong to this browser, identity and mode;
they are separate from the server journal.

![Saved attention filter](../screenshots/02-needs-attention.png)

## 3. Inspect a service and its runtime

Open **Workspace → Services → API Gateway**. The page shows the host, environment,
collection time, each named container, image, revision, process/health state,
restart count and start time. Follow **Catalog and dependencies** or **Health
runbook** when investigating. Refreshing the workspace reads a saved snapshot;
run your SSH collector separately to obtain new host observations.

The same screen compares runtime OCI revision labels with the latest configured
GitLab pipeline. The example pipeline succeeded but its commit differs from the
runtime. A matching commit still would not prove endpoint availability. Pipeline
URLs under `gitlab.example.com` are synthetic placeholders.

![Service details and pipeline comparison](../screenshots/09-service-workspace.png)

## 4. Inspect multiple worker containers

Select **Market data worker**. Three containers share one service record, while
the heartbeat has its own timestamp and expiry. A passing container check cannot
replace a workload heartbeat. This synthetic worker does not place trades.

![Worker containers and heartbeat](../screenshots/10-worker-containers.png)

## 5. Exercise an unhealthy container

Select **Demo scenario → Unhealthy container** and **API Gateway**. Its process
remains running, its health check fails and seven restarts are recorded. Operations
classifies the current failing check as critical; the timeline records the change.
No real container is stopped, restarted or modified by a scenario selection.

![Unhealthy container scenario](../screenshots/19-unhealthy-container.png)

## 6. Read and select history

Open **History**, choose **Event type → health** and **Filter service → API Gateway**.
Read observation time separately from recording time. Select a checkbox beside an
event, then choose **Draft worklog from selection**. Unchanged polls do not create
duplicate transitions. Older records are available with **Load older events**.

![Operations timeline](../screenshots/11-operations-history.png)

## 7. Review, save and export a worklog

The selected events produce a deterministic Markdown draft with citations. Set the
**Worklog title**, review **Worklog Markdown**, and add only actions and verification
you actually performed. Choose **Save reviewed worklog**. The saved list offers
**Read saved worklog** and **Download Markdown**; saved records survive restarts.

The pictured review explicitly describes a synthetic portal exercise. Drafting
does not call a model or invent an infrastructure fix.

![Reviewed worklog and export](../screenshots/12-reviewed-worklog.png)

## 8. Configure your own email route

Open **Notifications**. Recipient and sender start blank. After configuring the
backend provider, choose Resend or SNS and save settings. Resend uses these address
fields; SNS uses the confirmed subscribers of its configured topic. Enable automatic
messages only when this portal should own the alert route for those checks.

Provider secrets never belong in these forms. [Provider setup](workspace-setup.md#email-providers)
explains the configuration. The screenshot contains no personal address or API key.

![Blank notification configuration](../screenshots/13-email-configuration.png)

## 9. Separate a test request from receipt

On demo, click **Simulate email test**, wait for the worker to mark it Simulated, then choose
**Simulate receipt confirmation**. No email is sent. In real mode, use **Send test
email**, check your inbox, and only then choose **I received this email**.

Provider acceptance does not establish inbox delivery. Receipt is a user attestation.
An uncertain final outcome requires checking the provider before creating a new
message; test messages are limited to one per minute. Automatic observations require
the portal to run. See the queue walkthrough below for bounded automatic retries.

![Simulated attempt and receipt](../screenshots/14-email-receipt.png)

## 10. Read AWS costs and set a planning amount

Open **Costs**. Connect an existing named monthly AWS COST budget to use real data.
The example shows 42.50 USD actual spend and an 82 USD forecast. Enter `60` under
**Monthly budget amount**, keep `USD`, and choose **Save planning budget** to see
the forecast exceed your local target. These are demonstration amounts only.

Saving changes only a private portal preference. It does not create/edit an AWS
budget. Billing data is delayed; retrieval and budget configuration update times
are not underlying usage freshness. Missing spend remains unknown.

![AWS costs and planning preference](../screenshots/15-aws-costs.png)

## 11. Review certificate expiry

Open **Maintenance** and select **API Gateway**. Review the TLS hostname, expiry
and check time. Fewer than 14 days remaining needs attention. The example has ten
days remaining; unknown or expired evidence must be recollected before relying on it.

![Certificate and missing verification](../screenshots/16-certificate-reminders.png)

## 12. Record backup verification

After performing a real restore or other verification, enter **Verified at**, **Next
verification due** and **Backup verification evidence**, then choose **Record
verification**. The page shows who recorded it and the next due date. Future-dated
verification and a due date before verification are rejected.

This is a record form, not a backup/restore executor. The pictured entry is explicitly
synthetic and does not claim a real restore occurred.

![Backup verification and due date](../screenshots/17-backup-verification.png)

## 13. Keep service maintenance notes

Enter a plan or verified result in **Maintenance note** and click **Save note**.
The record stays with that service and includes the author and time. Keep secrets
out of notes, exported worklogs and repository screenshots.

![Saved maintenance note](../screenshots/18-maintenance-notes.png)

## 14. Detect a missing worker heartbeat

Select **Demo scenario → Expired worker heartbeat**, then **Market data worker**.
All three containers are running with passing health checks, but the workload's
heartbeat is ten minutes old. It remains **Unknown · no recent heartbeat**.

![Expired heartbeat despite running containers](../screenshots/20-expired-heartbeat.png)

## 15. Return to normal operation

Choose **Normal operation**, then **API Gateway**. Current synthetic checks pass,
the pipeline and runtime revisions match, the certificate is outside the warning
window and the forecast is within the example AWS limit. History retains the
earlier failure and subsequent observed recovery.

![Normal scenario](../screenshots/21-normal-scenario.png)

## 16. Handle a disconnected collector

Choose **Disconnected collector**. Current service details clear and the page
reports the source as unavailable. Historical records remain historical. The
scenario selector stays usable: select **Disk pressure** to recover the demo.

![Unavailable source with recovery control](../screenshots/05-source-unavailable.png)

## 17. Follow catalog relationships

From a service, open **Catalog and dependencies**. The catalog shows ownership,
system membership and related services. Registration describes relationships;
it is not proof that the registered workload is deployed or healthy.

![Catalog dependencies](../screenshots/03-service-relations.png)

## 18. Preview read-only agent context

Open **Agent access**, select **Purpose → Draft a worklog**, then **Generate preview**.
The JSON includes timestamped evidence, citations and runbooks. The three MCP tools
are read-only; their credential cannot save records, change scenarios or send email.
A model is supplied by your external client. This preview does not run inference.

![MCP tools and cited context](../screenshots/04-agent-worklog.png)

## 19. Use the handbook and runbooks

Open **Health runbook** for investigation steps, or **User manual** for setup and
everyday controls. Documentation is versioned with the implementation and rendered
through TechDocs; the Wiki links to these canonical pages.

![Rendered health runbook](../screenshots/06-health-runbook.png)

![Rendered user manual](../screenshots/22-user-manual.png)

## 20. Use the portal on a phone

The sidebar collapses and controls wrap on narrow screens. Wide container tables
scroll within their panel. These captures use a 390px viewport.

![Mobile overview](../screenshots/07-mobile.png)

![Mobile workspace](../screenshots/23-mobile-workspace.png)

## 21. Follow background delivery

Open **Notifications → Background delivery queue**. Sending a test saves a waiting
message before contacting the provider. The page refreshes progress every five
seconds, showing attempts, the next check and the worker's last check. Waiting
messages survive backend restarts; new observations and delivery require it to run.

Use **Cancel waiting delivery** while a message is Queued or Retrying to stop
future attempts. It cannot recall a message the provider already accepted.
Resend retries reuse the same request within bounded limits; ambiguous SNS sends
remain Uncertain. In demo, every delivery is simulated locally.

![Notification queue and progress](../screenshots/24-delivery-queue.png)

## 22. Upgrade storage and recover delivery

Choose **Delivery recovery and database upgrades** from the queue card. Follow
the backup and upgrade steps before changing versions. Migrations preserve the
journal and old receipt records; they never send historical attempts again.
The guide explains each status, cancellation, retry limits and restoring a matching
backup/application version. A restored database must be reconciled with provider
history before enabling delivery.

![Storage and delivery recovery manual](../screenshots/25-storage-recovery.png)

## 23. Read inventory and collection coverage

Open **AWS inventory**. Read the source and evidence timestamp before using an
instance's region, lifecycle or service mapping. Search **Find an instance or
service**, then follow **Inspect service containers and deployed revisions**.
The second region intentionally has unavailable coverage. Running EC2 lifecycle
does not establish application health; refreshing reads the saved collection.

![Synthetic inventory with explicit coverage](../screenshots/26-aws-inventory.png)

## 24. Configure private sign-in and practice restore

Follow **Private production setup** in the handbook. Register your GitLab OAuth
application, map your numeric user ID, provide private configuration and retain
the persistent data volume. Use the backup helper to create a checked copy and
restore it to a separate path. The manual screenshot is configuration guidance,
not evidence of a completed OAuth sign-in or a production deployment.

![GitLab identity and persistent storage manual](../screenshots/27-production-setup.png)

The isolated production check verifies the screen below has GitLab sign-in and no
guest entry. It also checks API authentication and journal persistence across a
restart. Dummy OAuth values are used; no GitLab account login is performed.

![Verified production sign-in screen](../screenshots/30-production-sign-in.png)

## 25. Exercise an isolated deployment and rollback

Follow **Sandbox delivery and rollback**. Build two source-revision-labeled images,
deploy each immutable image, then restore the prior verified release and check its
endpoint. The sample is restricted to one labeled, resource-limited container.
The AWS section explains ECR/SSM setup and the exact-target delivery record.
Terraform and CI examples do not activate themselves.

![Controlled sandbox delivery manual](../screenshots/28-sandbox-delivery.png)

## 26. Connect an external model through MCP

Follow **Model client and evaluations**. First run the context-only command, which
needs no model API key. Inspect the private evidence, then configure your chosen
model and request a draft. Missing, stale, future or conflicting observations
produce abstention; invalid citation IDs are rejected. Review every statement before
copying a draft into a worklog. The screenshot shows the manual, not live inference.

![MCP client and evidence checks manual](../screenshots/29-model-client.png)

## 27. Connect your own cloud and Linux servers

Open **Connections**. Choose AWS inventory or Linux servers over SSH. Fields start
blank in both branches; the form does not inherit the author's infrastructure.

![Blank cloud and server setup](../screenshots/31-connections.png)

For AWS, enter your expected account, regions, optional CLI profile and the backend
snapshot directory. Choose **Prepare setup** to review and download configuration.
The example below uses a synthetic account and has not contacted AWS.

![Synthetic AWS setup ready for review](../screenshots/32-aws-connection-draft.png)

For Linux, use **Add server** to configure multiple SSH aliases and catalog references.
This works with suitable Linux hosts across providers. Run collection separately
using your own authenticated client, then verify the resulting evidence. The form
does not install settings or treat a prepared draft as a successful connection.
Follow the [full connection manual](connections.md) for installation and maintenance.

![Two synthetic SSH targets and their configuration](../screenshots/33-ssh-connection-draft.png)

## 28. Save and test a connection profile

Prepare the connection details, enter a name and environment under **Saved
connections**, then choose **Save new connection**. Reloading preserves the profile.
Use **Edit profile** to load its saved details; preparing and saving an edit creates
a new revision and clears earlier verification. Filter the list by name or environment.

Choose **Test connection** to check the saved revision. Demo always simulates, and
labels each result accordingly. The example shows synthetic AWS identity and region
checks. A successful test establishes access, not monitoring or application health.
On main, tests stay disabled until an administrator installs the optional clients
and approves targets in the [testing configuration](connections.md#enable-live-tests).

![Saved profile with simulated access checks](../screenshots/34-saved-connection-test.png)

## 29. Diagnose failed access and disable a profile

In demo choose **Access denied** under **Simulation result**, then test a saved
profile. Read each check's status and diagnostic. In live mode diagnostics distinguish
missing/expired credentials, missing tools, rejected host keys, denial and timeout;
raw client output is never shown. An expired test or interrupted job needs a new test.

![Simulated access denial](../screenshots/35-denied-connection.png)

Choose **Disable profile** to cancel an active test, clear verification and block
further tests. **Enable profile** permits a new explicit test. This switch does not
stop an external collector or a cloud workload; manage those separately. Only
configured workspace owners can save, edit, disable or test profiles; agent access
does not grant these actions.

![Disabled profile with testing unavailable](../screenshots/36-disabled-connection.png)

## 30. Choose only the features you need

Open **Workspace features** in the sidebar. **Minimal** selects the core overview,
catalog, docs and settings. Choose **Save feature choices** to apply it. The example
below is an isolated demo workspace with all optional modules turned off.

![Minimal workspace feature choices](../screenshots/37-minimal-features.png)

Turn on individual switches, then save. Here only **Cloud connections** and
**Cost tracking** are selected. Choices persist across reloads and restarts;
disabled modules retain their private data. **Enable all** is available when you
want the full demonstration again. Only workspace owners can change these settings.

![Two selected optional modules](../screenshots/38-selected-features.png)

The sidebar and workspace tabs follow the saved choices. This workspace shows
only the costs tab; notifications and other optional panels do not load. Direct
links and API calls cannot bypass a disabled module. Disabling also stops its
optional work; already-issued requests may finish. Read the
[feature settings guide](features.md) for shared evidence dependencies and how
queued emails and connection tests are handled.

![Workspace with only cost tracking enabled](../screenshots/39-optional-workspace.png)

## Main starts empty

Main contains the same features and setup guides, with no sample workload catalog,
runtime fixture, default email recipient or default planning amount. An unconfigured
source reports zero observations and unknown overall health.
New main workspaces also start with optional modules off; enable only what you need
through Workspace features. The earlier empty-state illustration predates this
navigation preference.

![Main without sample observations](../screenshots/08-main-empty.png)

## Reproduce the gallery

Use the demo branch with its default overlay and an empty private demo database.
Stop the portal and preserve any existing `private/operations-demo.sqlite` before
starting a fresh demo database; do not discard records you need. Do not load private
source or integration overlays. After the full backend startup succeeds:

```powershell
node scripts/capture-demo.mjs
```

To refresh only the four inventory/setup additions without resetting or changing
the demo journal, run `node scripts/capture-additions.mjs`. It validates every
synthetic inventory identity before capture and preserves earlier capture metadata.

Use `node scripts/test-connections.mjs --demo --capture` to refresh the six connection
screenshots and check the browser workflow. It starts a separate backend with a
fresh temporary journal, creates explicitly synthetic profiles and exercises
simulated tests, then stops its own process. It never reads existing journal records
or loads a private connection overlay. Main's matching check omits `--demo --capture`.
The earlier `node scripts/capture-connections.mjs` command captures only the three
setup forms and refuses any saved profiles to avoid publishing private records.

For the three optional-feature illustrations, run
`node scripts/test-connections.mjs --demo --features --capture`. Review the PNGs in
the printed temporary evidence directory, then copy only those images into the
gallery and record their application revision. The helper changes only its own
temporary journal and stops its own backend after the checks.

The script checks the tracked synthetic fixture, service fields and blank private
records before capture. It exercises the controls, creates explicitly synthetic
records, validates downloads, and captures every page above except the separate
main-branch empty state and production sign-in screen. To reproduce the latter,
run `node scripts/test-production.mjs`, check its successful private `result.json`,
and review `gitlab-sign-in.png` in the same evidence directory before copying it
to the gallery. It never opens a real OAuth login. The demo capture script refuses earlier documents or configured recipients to
avoid accidentally publishing user records. `docs/screenshots/capture.json` records
the fixture hash, revision and capture purposes. Screenshots are illustrations;
unit, protocol and browser results are documented in the
[verification worklog](../releases/preview.md).
