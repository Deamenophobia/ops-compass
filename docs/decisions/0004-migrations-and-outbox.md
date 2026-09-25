# ADR 0004: versioned storage and a persistent notification queue

Status: accepted for the local single-backend portal, 2026-09-25.

ADR 0003 left a crash gap between event recording and notification sending. Its
table initialization also could not describe future schema upgrades. Use embedded,
numbered Knex migrations and an outbox table in the same Operations database.
Embedding migration functions keeps them in the backend bundle without a fragile
runtime path to TypeScript source or additional copied migration assets.

Adopt existing journal tables without dropping records. Import old notification
attempts as terminal history; their original bodies were not stored, so they cannot
be replayed. Store applied versions and reject a newer unknown migration. Prefer a
verified database/application backup restore to destructive downgrade migrations.

Commit state, event and delivery intent together. A separate in-process worker uses
conditional database claims, immutable messages, bounded batches and provider-aware
retry rules. Resend has a bounded idempotency contract; standard SNS cannot safely
replay an ambiguous publish. Destination changes must not redirect old queued jobs.
Provider acceptance remains distinct from user-attested inbox receipt.

This is intentionally smaller than introducing a broker, cloud queue and separate
worker deployment for a local personal portal. Persistence closes the pre-send crash
gap and permits restart recovery, but does not observe outages while the portal is
stopped or prove exactly-once delivery. Queue history is retained; retention and
multi-instance operation require separate work and tests.

The [operations guide](../guides/storage-and-delivery.md) defines upgrade, restore,
retry, cancellation and uncertainty behavior. This decision supersedes ADR 0003's
statements that migrations and a persistent delivery queue are future work.
