import knex from 'knex';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigReader } from '@backstage/config';
import { Snapshot } from '@ops-compass/operations-common';
import { OperationsStore } from './store';
import { Integrations } from './integrations';
import { WorkspaceService, draftWorklog } from './workspace';

const observation = () => ({
  id: 'test',
  entityRef: 'component:default/test',
  label: 'Readiness',
  environment: 'test',
  region: 'test',
  state: 'healthy' as const,
  observedAt: new Date().toISOString(),
  summary: 'Test observation',
});

it('persists records across a closed and reopened database', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ops-journal-'));
  const filename = join(directory, 'journal.sqlite');
  let db = knex({
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
  });
  try {
    let store = new OperationsStore(db);
    await store.init();
    const document = await store.saveDocument({
      kind: 'worklog',
      serviceId: '',
      title: 'Verified work',
      markdown: 'A retained record.',
      actor: 'user:default/owner',
    });
    await db.destroy();
    db = knex({
      client: 'better-sqlite3',
      connection: { filename },
      useNullAsDefault: true,
    });
    store = new OperationsStore(db);
    await store.init();
    expect((await store.document(document.id))?.markdown).toBe(
      'A retained record.',
    );
    expect(await store.events()).toHaveLength(1);
  } finally {
    await db.destroy();
    await unlink(filename);
    await rmdir(directory);
  }
});

it('deduplicates concurrent polls, records recovery and never equates acceptance with receipt', async () => {
  const db = knex({
    client: 'better-sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });
  try {
    const store = new OperationsStore(db);
    await store.init();
    const config = new ConfigReader({
      opsCompass: { notifications: { resendApiKey: 'not-a-real-key' } },
    });
    const integrations = new Integrations(config);
    const send = jest.spyOn(integrations, 'send').mockResolvedValue(undefined);
    let snapshot: Snapshot = {
      schemaVersion: 1,
      source: 'ssh',
      observations: [observation()],
    };
    const service = new WorkspaceService(
      store,
      { provider: async () => snapshot },
      integrations,
      'snapshot',
      300,
      config,
    );
    await service.saveSettings(
      {
        provider: 'resend',
        sender: 'alerts@example.com',
        recipient: 'owner@example.com',
        automatic: true,
      },
      'owner',
    );
    await Promise.all([service.collect(), service.collect()]);
    const baseline = (await store.events()).length;
    await service.collect();
    expect((await store.events()).length).toBe(baseline);
    expect(send).not.toHaveBeenCalled();
    snapshot = {
      ...snapshot,
      observations: [{ ...observation(), state: 'critical' }],
    };
    await Promise.all([service.collect(), service.collect()]);
    await service.delivery.run();
    expect(send).toHaveBeenCalledTimes(1);
    let attempts = await store.attempts();
    expect(attempts[0].status).toBe('accepted');
    expect(attempts[0].receivedAt).toBeUndefined();
    await store.acknowledge(attempts[0].id, 'owner');
    expect((await store.attempts())[0].receivedBy).toBe('owner');
    snapshot = { ...snapshot, observations: [observation()] };
    await service.collect();
    await service.delivery.run();
    expect(send).toHaveBeenCalledTimes(2);
    send.mockRejectedValueOnce(new Error('private provider detail'));
    snapshot = {
      ...snapshot,
      observations: [
        {
          ...observation(),
          observedAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ],
    };
    await service.collect();
    await service.collect();
    await service.delivery.run();
    attempts = await store.attempts();
    expect(attempts[0].status).toBe('retrying');
    expect(JSON.stringify(attempts)).not.toContain('private provider detail');
    expect(send).toHaveBeenCalledTimes(3);
  } finally {
    await db.destroy();
  }
});

it('keeps simulation isolated from real mail and clears runtime values on source failure', async () => {
  const db = knex({
    client: 'better-sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });
  try {
    const store = new OperationsStore(db);
    await store.init();
    const config = new ConfigReader({
      opsCompass: { notifications: { resendApiKey: 'not-a-real-key' } },
    });
    const integrations = new Integrations(config);
    const send = jest.spyOn(integrations, 'send');
    const subscriptions = jest.spyOn(integrations, 'subscriptions');
    const provider = jest.fn().mockResolvedValue({
      schemaVersion: 1,
      source: 'demo',
      observations: [observation()],
    });
    const service = new WorkspaceService(
      store,
      { provider },
      integrations,
      'demo',
      300,
      config,
    );
    await service.testNotification();
    expect((await store.attempts())[0].status).toBe('queued');
    await service.delivery.run();
    expect(send).not.toHaveBeenCalled();
    expect((await service.notificationProgress()).queue.simulated).toBe(1);
    expect(subscriptions).not.toHaveBeenCalled();
    expect((await store.attempts())[0].status).toBe('simulated');
    await expect(service.testNotification()).rejects.toThrow('one minute');
    provider.mockRejectedValue(new Error('private-path'));
    expect(await service.read(true)).toMatchObject({
      sourceStatus: 'unavailable',
      services: [],
      deployments: { status: 'unavailable', items: [] },
    });
  } finally {
    await db.destroy();
  }
});

it('drafts cite selected records and leave actions and verification unclaimed', () => {
  const markdown = draftWorklog('Review', [
    {
      id: 42,
      kind: 'health',
      source: 'ssh',
      title: 'Stale heartbeat',
      detail: 'Unknown',
      actor: 'monitor',
      serviceId: 'worker',
      createdAt: '2026-09-25T00:00:00Z',
    },
  ]);
  expect(markdown).toContain('Event 42');
  expect(markdown).toContain(
    'Not supplied. Record only actions you performed.',
  );
  expect(markdown).toContain('Not supplied. Record the outcome');
});
