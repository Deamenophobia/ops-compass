# ADR 0003: persistent records and configurable notifications

Status: accepted for the local single-instance portal, 2026-09-25.

Update: [ADR 0004](0004-migrations-and-outbox.md) supersedes the migration/outbox
limitations below with the implemented persistent queue and bounded retry policy.

Use Backstage's plugin database service for the journal, state deduplication,
notes, worklogs and notification attempts. Main and demo use different private
SQLite files. Catalog/auth development storage is separate.

The background collector records transitions and runtime changes. The shared health
evaluator derives container, heartbeat and certificate checks so HTTP, MCP and
Operations agree. Reads never send email; sends belong to collection and owner actions.
Only configured user owners may write. The MCP registry remains three read-only tools.

Recipients start blank. Resend follows the inspected personal application's HTTPS
pattern; SNS is optional. No branded sender, personal recipient or secret is copied.
Demo simulates attempts regardless of credentials. Persist an uncertain attempt
before publishing. Provider acceptance and human-attested receipt are separate.
Do not automatically retry uncertain sends, particularly standard SNS without deduplication.

SQLite and serialized writes support a persistent local tool, not a highly available
notification service. A crash between recording a transition and sending can leave
an alert unsent; review attempts and retain independent monitoring for critical
services. A future durable queue can add an explicit recovery/retry policy.

Pipeline success is not deployment proof. Missing/old runtime revisions remain
unknown. AWS budget reads are read-only; missing spend is not zero. A planning budget
is a private preference. Shared manuals/code live on main; synthetic examples and
the illustrated walkthrough live on demo.
