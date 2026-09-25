# Database upgrades and background delivery

The Operations journal now has numbered database migrations and a persistent
notification queue. Email still starts disabled, with blank recipient/sender fields.
The queue runs inside the portal backend; it is not a separate monitoring service.

## Upgrade an existing journal

1. Stop the portal. Preserve its application commit, configuration and database.
   Main uses `private/operations.sqlite`; demo uses `private/operations-demo.sqlite`.
   Use a SQLite backup tool for a consistent backup, or copy the database with all
   writers stopped. Keep backups private and verify that they can be opened.
2. Update the application, install its locked dependencies and build it as described
   in [Local setup](local-setup.md). Run one backend instance for this journal.
3. Start the portal. Migrations run before the Operations API, collector and delivery
   worker start. Check startup completion and inspect existing notes/worklogs.
4. Open **Workspace → Notifications**. Previously accepted, simulated and uncertain
   attempts retain their status and receipt records. They are history, never queued
   for delivery during migration.

Migration `001-journal` adopts the original tables and validates their required
columns. `002-notification-outbox` creates the queue and imports legacy attempts.
Knex records applied names in `ops_migrations` and uses its migration lock. Upgrades
run transactionally; an invalid legacy shape or unknown newer migration stops startup.
Do not delete migration records, change an applied migration, or force-unlock a live
database. Inspect the failure with the portal stopped and retain the original backup.

For rollback, stop the new application, preserve its database for investigation,
then restore the pre-upgrade backup together with the matching application commit
and configuration. Downgrade migrations are deliberately unavailable because they
could discard queued messages or records written after the upgrade. This restore
loses subsequent local changes, which must be reviewed separately. **Do not resume
delivery blindly after restoring a backup:** the provider may already have accepted
messages missing from that backup. Disable provider configuration until reconciled.

## Read delivery progress

Open **Workspace → Notifications**. The queue summary covers all records; the list
shows the latest 100. Progress refreshes every five seconds without overwriting
unsaved form inputs or polling AWS subscription APIs.

| State     | Meaning and next step                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Queued    | Saved on disk, waiting for the worker. Can be cancelled.                                              |
| Sending   | The worker claimed it and may be contacting the provider. Cannot be recalled.                         |
| Retrying  | A retry is scheduled; its next check is displayed. Can be cancelled.                                  |
| Accepted  | The provider confirmed acceptance. Check your inbox before confirming receipt.                        |
| Simulated | Demo completed locally; no external send occurred.                                                    |
| Failed    | A definitive rejection, retry limit, or unsent-message expiry stopped delivery. Review configuration. |
| Uncertain | Acceptance may have happened. Review the provider before sending anything new.                        |
| Cancelled | Waiting work stopped before a known send. Cancellation cannot undo prior provider acceptance.         |

**Send test email** saves a queue entry and returns immediately. Demo's **Simulate
email test** uses the same queue but never calls a provider. Tests are limited to
one per minute. **Cancel waiting delivery** stops a queued/retrying job; if an earlier
attempt was ambiguous, its final state remains Uncertain. There is no blind retry
button for uncertain sends. Human receipt confirmation remains separate from
provider acceptance.

## Recovery and retry policy

The collector saves a state transition, its event and its delivery intent in one
transaction. Duplicate observations do not create new alerts. The worker checks
every five seconds, processes at most ten records per tick and claims each record
before sending. A claimed message left behind by a crash becomes eligible for
recovery after two minutes. Queued records survive a stopped backend, but delivery
and new observations resume only when it runs again.

Each new message gets a random, persistent ID and immutable text/destination data.
Resend retries reuse that ID and payload. Resend documents a 24-hour idempotency
window; this application stops retries after 23 hours from the first attempt,
with a maximum of five attempts. Delays start at 30 seconds and grow by a factor
of four; a longer `Retry-After` is respected. Network timeouts, server errors and
ambiguous responses can be retried within that window. Most client rejections
stop immediately. See [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

SNS publishes use one SDK attempt. Explicit throttling can be retried, while
authorization/validation rejections stop. A timeout, internal error or interrupted
SNS publish stays Uncertain; standard SNS topics do not provide the FIFO publish
deduplication used for safe replay. See [SNS Publish](https://docs.aws.amazon.com/sns/latest/api/API_Publish.html).

Never-attempted messages expire after 24 hours, preventing an old alert backlog from
being delivered after a long outage. Disabling automatic alerts cancels waiting
transition messages. Disabling the provider or changing destination/provider identity
stops affected waiting jobs; they are never silently redirected. An already Sending
request can still finish. Missing credentials defer work, but restoring a different
credential identity cancels the old route. Keep the server clock accurate.

## What is verified and what remains

Tests cover legacy upgrades, rollback on malformed schema, reopen/recovery,
transaction rollback, duplicate claims, idempotent retries, rate limiting, expiry,
changed settings, cancellation and accepted-versus-received status. Provider errors
are redacted; message bodies, destinations and route fingerprints stay in the private
database and are omitted from progress responses. MCP credentials cannot cancel jobs.

SQLite remains a single-backend setup. This does not claim high availability,
exactly-once inbox delivery or a tested PostgreSQL deployment. Database retention,
external worker hosting, provider delivery webhooks and live inbox verification
are future work. Preserve independent monitoring for workloads that must alert while
the portal is offline.
