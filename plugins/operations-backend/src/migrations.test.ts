import knex from 'knex';
import { OperationsStore } from './store';

const database = () =>
  knex({
    client: 'better-sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });

it('adopts an unversioned journal and retains documents, settings and legacy receipts without queueing them', async () => {
  const db = database();
  try {
    // The schema shipped before versioned migrations, independent of the new source.
    await db.raw(
      'CREATE TABLE ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, serviceId TEXT NOT NULL, createdAt TEXT NOT NULL, data TEXT NOT NULL)',
    );
    await db.raw(
      'CREATE TABLE ops_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    );
    await db.raw(
      'CREATE TABLE ops_documents (id TEXT PRIMARY KEY, kind TEXT NOT NULL, createdAt TEXT NOT NULL, data TEXT NOT NULL)',
    );
    const createdAt = '2026-09-25T00:00:00.000Z';
    const document = {
      id: 'retained',
      kind: 'note',
      serviceId: 'worker',
      title: 'Original note',
      markdown: 'Keep this record',
      actor: 'owner',
      createdAt,
    };
    await db('ops_documents').insert({
      id: document.id,
      kind: document.kind,
      createdAt,
      data: JSON.stringify(document),
    });
    await db('ops_state').insert([
      { key: 'budget-preference', value: '{"amount":60,"currency":"USD"}' },
      {
        key: 'notification-attempts',
        value: JSON.stringify([
          {
            id: 'event-42',
            subject: 'Old accepted message',
            createdAt,
            status: 'accepted',
            receivedAt: createdAt,
            receivedBy: 'owner',
          },
          {
            id: 'event-43',
            subject: 'Old unknown message',
            createdAt,
            status: 'uncertain',
          },
        ]),
      },
    ]);
    const store = new OperationsStore(db);
    await store.init();
    await store.init();
    expect(await store.document('retained')).toEqual(document);
    expect(await store.get('budget-preference')).toEqual({
      amount: 60,
      currency: 'USD',
    });
    expect(await store.attempts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'event-42',
          status: 'accepted',
          receivedBy: 'owner',
        }),
        expect.objectContaining({ id: 'event-43', status: 'uncertain' }),
      ]),
    );
    expect(await store.outbox.next(Date.now())).toBeUndefined();
    expect(await store.get('notification-attempts')).toBeUndefined();
    expect(await db('ops_migrations').select('name')).toEqual([
      { name: '001-journal' },
      { name: '002-notification-outbox' },
      { name: '003-workspace-scope' },
    ]);
  } finally {
    await db.destroy();
  }
});

it('refuses an unknown legacy shape and rolls back the migration batch', async () => {
  const db = database();
  try {
    await db.raw('CREATE TABLE ops_events (id INTEGER PRIMARY KEY)');
    await db('ops_events').insert({ id: 7 });
    await expect(new OperationsStore(db).init()).rejects.toThrow(
      'Unsupported legacy journal shape',
    );
    expect(await db('ops_events')).toEqual([{ id: 7 }]);
    expect(await db.schema.hasTable('ops_state')).toBe(false);
    expect(await db.schema.hasTable('ops_outbox')).toBe(false);
    expect(await db('ops_migrations')).toEqual([]);
  } finally {
    await db.destroy();
  }
});

it('refuses a database created by newer application migrations', async () => {
  const db = database();
  try {
    const store = new OperationsStore(db);
    await store.init();
    await db('ops_migrations').insert({
      name: '999-future-schema',
      batch: 2,
      migration_time: new Date(),
    });
    await expect(store.init()).rejects.toThrow('999-future-schema');
  } finally {
    await db.destroy();
  }
});

it('upgrades the v0.1 queue without changing IDs, retry state, payloads or deduplication', async () => {
  const db = database();
  try {
    // Frozen v0.1 schema: this fixture deliberately does not call current migrations.
    await db.migrate.latest({
      tableName: 'ops_migrations',
      migrationSource: {
        getMigrations: async () => ['001-journal', '002-notification-outbox'],
        getMigrationName: (name: string) => name,
        getMigration: async (name: string) => ({
          up: async (legacy: typeof db) => {
            if (name === '001-journal') {
              await legacy.raw(
                'CREATE TABLE ops_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
              );
              await legacy.raw(
                'CREATE TABLE ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, serviceId TEXT NOT NULL, createdAt TEXT NOT NULL, data TEXT NOT NULL)',
              );
              await legacy.raw(
                'CREATE TABLE ops_documents (id TEXT PRIMARY KEY, kind TEXT NOT NULL, createdAt TEXT NOT NULL, data TEXT NOT NULL)',
              );
            } else {
              await legacy.raw(
                'CREATE TABLE ops_outbox (id TEXT PRIMARY KEY, dedupeKey TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, createdAt TEXT NOT NULL, status TEXT NOT NULL, attemptCount INTEGER NOT NULL DEFAULT 0, firstAttemptAt TEXT, lastAttemptAt TEXT, nextAttemptAt TEXT, hadUncertainty BOOLEAN NOT NULL DEFAULT 0, receivedAt TEXT, receivedBy TEXT, error TEXT, payload TEXT NOT NULL)',
              );
            }
          },
          down: async () => {},
        }),
      },
    });
    const now = new Date().toISOString();
    const payload = {
      kind: 'test' as const,
      subject: 'Retained job',
      text: 'Synthetic message',
      settings: {
        provider: 'disabled' as const,
        automatic: false,
        sender: '',
        recipient: '',
      },
      routeHash: 'test',
      simulated: true,
    };
    await db('ops_outbox').insert({
      id: 'old-job',
      dedupeKey: 'old-key',
      kind: 'test',
      createdAt: now,
      status: 'retrying',
      attemptCount: 2,
      nextAttemptAt: now,
      payload: JSON.stringify(payload),
    });
    const store = new OperationsStore(db);
    await store.init();
    const job = await store.outbox.next(Date.now());
    expect(job).toMatchObject({
      id: 'old-job',
      status: 'retrying',
      attemptCount: 2,
      payload: JSON.stringify(payload),
      workspaceId: 'personal',
      dedupeKey: 'personal:old-key',
    });
    await store.outbox.enqueue(payload, 'old-key');
    expect(await store.attempts()).toHaveLength(1);
    const other = new OperationsStore(
      db,
      '2b4e3c6b-8cc0-4b65-975b-d66a02d5b082',
    );
    expect(await other.outbox.next(Date.now())).toBeUndefined();
  } finally {
    await db.destroy();
  }
});
