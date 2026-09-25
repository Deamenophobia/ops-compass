import { z } from 'zod/v3';
import { Database } from './database';

// Embedded migrations travel with the backend bundle. Never change an applied
// migration: add a new version so existing journals have a reproducible upgrade.
const migrations = [
  {
    name: '001-journal',
    async up(db: Database) {
      if (!(await db.schema.hasTable('ops_events'))) {
        await db.schema.createTable('ops_events', table => {
          table.increments('id').primary();
          table.string('kind').notNullable();
          table.string('serviceId').notNullable();
          table.string('createdAt').notNullable();
          table.text('data').notNullable();
          table.index(['serviceId', 'id']);
        });
      }
      if (!(await db.schema.hasTable('ops_state'))) {
        await db.schema.createTable('ops_state', table => {
          table.string('key').primary();
          table.text('value').notNullable();
        });
      }
      if (!(await db.schema.hasTable('ops_documents'))) {
        await db.schema.createTable('ops_documents', table => {
          table.string('id').primary();
          table.string('kind').notNullable();
          table.string('createdAt').notNullable();
          table.text('data').notNullable();
        });
      }
      // Adopt the original unversioned journal without dropping data. An unknown
      // shape needs operator review; silently stamping it as migrated would hide loss.
      for (const [table, columns] of Object.entries({
        ops_events: ['id', 'kind', 'serviceId', 'createdAt', 'data'],
        ops_state: ['key', 'value'],
        ops_documents: ['id', 'kind', 'createdAt', 'data'],
      })) {
        const present = await db(table).columnInfo();
        if (columns.some(column => !Object.hasOwn(present, column)))
          throw new Error(`Unsupported legacy journal shape: ${table}`);
      }
    },
  },
  {
    name: '002-notification-outbox',
    async up(db: Database) {
      await db.schema.createTable('ops_outbox', table => {
        table.string('id').primary();
        table.string('dedupeKey').notNullable().unique();
        table.string('kind').notNullable();
        table.string('createdAt').notNullable();
        table.string('status').notNullable();
        table.integer('attemptCount').notNullable().defaultTo(0);
        table.string('firstAttemptAt');
        table.string('lastAttemptAt');
        table.string('nextAttemptAt');
        table.boolean('hadUncertainty').notNullable().defaultTo(false);
        table.string('receivedAt');
        table.string('receivedBy');
        table.text('error');
        table.text('payload').notNullable();
        table.index(['status', 'nextAttemptAt']);
      });
      const previous = await db('ops_state')
        .where({ key: 'notification-attempts' })
        .first();
      if (!previous) return;
      const attempts = z
        .array(
          z.object({
            id: z.string().min(1),
            createdAt: z.string().datetime({ offset: true }),
            subject: z.string(),
            status: z.enum(['accepted', 'failed', 'simulated', 'uncertain']),
            receivedAt: z.string().optional(),
            receivedBy: z.string().optional(),
          }),
        )
        .parse(JSON.parse(previous.value));
      for (const attempt of attempts) {
        await db('ops_outbox').insert({
          id: attempt.id,
          dedupeKey: attempt.id,
          kind: attempt.subject.toLowerCase().includes('test')
            ? 'test'
            : 'legacy',
          createdAt: attempt.createdAt,
          status: attempt.status,
          attemptCount: 1,
          receivedAt: attempt.receivedAt ?? null,
          receivedBy: attempt.receivedBy ?? null,
          hadUncertainty: attempt.status === 'uncertain',
          error:
            attempt.status === 'uncertain'
              ? 'Legacy acceptance unverified; this record is never retried.'
              : null,
          payload: JSON.stringify({ subject: attempt.subject }),
        });
      }
      // Import and removal share the migration transaction; legacy outcomes never
      // become deliverable jobs because their original payloads were not retained.
      await db('ops_state').where({ key: 'notification-attempts' }).delete();
    },
  },
];

export async function migrateDatabase(db: Database) {
  await db.migrate.latest({
    tableName: 'ops_migrations',
    migrationSource: {
      getMigrations: async () => migrations,
      getMigrationName: (migration: (typeof migrations)[number]) =>
        migration.name,
      getMigration: async (migration: (typeof migrations)[number]) => ({
        up: migration.up,
        down: async () => {
          throw new Error(
            'Downgrades require a verified backup and the matching application version',
          );
        },
      }),
    },
  });
}
