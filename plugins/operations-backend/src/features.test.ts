import knex from 'knex';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigReader } from '@backstage/config';
import { featurePreset } from '@ops-compass/operations-common';
import { FeatureService } from './features';
import { OperationsStore } from './store';
import { WorkspaceService } from './workspace';
import { Integrations } from './integrations';
import { registerAgentActions } from './actions';
import { createEvidenceService } from './agent';
import { ActionsRegistryService } from '@backstage/backend-plugin-api/alpha';
import { ConnectionService } from './connections';
import { ConnectionProbe } from './connectionProbe';

const config = (mode = 'unconfigured') =>
  new ConfigReader({ opsCompass: { mode } });
const database = (filename = ':memory:') =>
  knex({
    client: 'better-sqlite3',
    connection: filename === ':memory:' ? filename : { filename },
    useNullAsDefault: true,
  });

it('starts main minimal, persists choices across restart, retains data and rejects stale edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ops-features-'));
  const filename = join(directory, 'journal.sqlite');
  let db = database(filename);
  try {
    let store = new OperationsStore(db);
    await store.init();
    let features = new FeatureService(store, config());
    await features.init();
    expect(features.read().enabled).toEqual(featurePreset(false));
    const note = await store.saveDocument({
      kind: 'note',
      serviceId: '',
      title: 'Retain',
      markdown: 'Keep me',
      actor: 'owner',
    });
    await features.save(
      { version: 0, enabled: { ...featurePreset(false), maintenance: true } },
      'owner',
    );
    await expect(
      features.save({ version: 0, enabled: featurePreset(true) }, 'owner'),
    ).rejects.toThrow();
    await db.destroy();
    db = database(filename);
    store = new OperationsStore(db);
    await store.init();
    features = new FeatureService(store, config('demo'));
    await features.init();
    expect(features.read()).toMatchObject({
      version: 1,
      enabled: { maintenance: true, agent: false },
    });
    await features.save({ version: 1, enabled: featurePreset(false) }, 'owner');
    expect((await store.document(note.id))?.markdown).toBe('Keep me');
  } finally {
    await db.destroy();
    await unlink(filename);
    await rmdir(directory);
  }
});

it('keeps default demo features on, validates config and never applies failed storage writes', async () => {
  const db = database();
  try {
    const store = new OperationsStore(db);
    await store.init();
    const changed = jest.fn();
    const features = new FeatureService(store, config('demo'), changed);
    await features.init();
    expect(features.read().enabled).toEqual(featurePreset(true));
    expect(
      () =>
        new FeatureService(
          store,
          new ConfigReader({
            opsCompass: {
              mode: 'demo',
              features: { defaults: { invented: true } },
            },
          }),
        ),
    ).toThrow();
    jest.spyOn(store, 'put').mockRejectedValueOnce(new Error('disk full'));
    await expect(
      features.save({ version: 0, enabled: featurePreset(false) }, 'owner'),
    ).rejects.toThrow();
    expect(features.enabled('notifications')).toBe(true);
    expect(changed).not.toHaveBeenCalled();
  } finally {
    await db.destroy();
  }
});

it('skips optional collection and provider reads when their modules are disabled', async () => {
  const db = database();
  const cfg = new ConfigReader({
    opsCompass: {
      mode: 'snapshot',
      gitlab: {
        baseUrl: 'https://gitlab.example.test',
        token: 'test',
        projects: [{ serviceId: 'test', projectId: '1' }],
      },
      costs: { accountId: '000000000000', budgetName: 'test' },
    },
  });
  const integrations = new Integrations(cfg);
  try {
    const store = new OperationsStore(db);
    await store.init();
    const features = new FeatureService(store, cfg);
    await features.init();
    const provider = jest.fn(async () => ({
      schemaVersion: 1 as const,
      source: 'ssh' as const,
      observations: [],
    }));
    const pipelines = jest
      .spyOn(integrations, 'deployments')
      .mockResolvedValue([]);
    const budget = jest
      .spyOn(integrations, 'budget')
      .mockRejectedValue(new Error('Synthetic unavailable budget'));
    const workspace = new WorkspaceService(
      store,
      { provider },
      integrations,
      'snapshot',
      300,
      cfg,
      features.enabled,
    );
    await workspace.collect();
    await workspace.read(true);
    await workspace.delivery.run();
    expect(provider).not.toHaveBeenCalled();
    expect(pipelines).not.toHaveBeenCalled();
    expect(budget).not.toHaveBeenCalled();
    expect(await store.events()).toHaveLength(0);
    await features.save(
      { version: 0, enabled: { ...featurePreset(false), costs: true } },
      'owner',
    );
    expect((await workspace.read(true)).costs.status).toBe('unavailable');
    expect(budget).toHaveBeenCalledTimes(1);
    expect(provider).not.toHaveBeenCalled();
    expect(pipelines).not.toHaveBeenCalled();
  } finally {
    integrations.close();
    await db.destroy();
  }
});

it('stops queued notifications and never replays them on enable', async () => {
  const db = database();
  const integrations = new Integrations(config('demo'));
  try {
    const store = new OperationsStore(db);
    await store.init();
    const features = new FeatureService(store, config('demo'));
    await features.init();
    const workspace: WorkspaceService = new WorkspaceService(
      store,
      {
        provider: async () => ({
          schemaVersion: 1,
          source: 'demo',
          observations: [],
        }),
      },
      integrations,
      'demo',
      300,
      config('demo'),
      features.enabled,
    );
    features.setChangeHandler(async (_before, after) => {
      if (!after.enabled.notifications) await workspace.pauseNotifications();
    });
    await workspace.testNotification();
    await features.save({ version: 0, enabled: featurePreset(false) }, 'owner');
    await workspace.delivery.run();
    expect((await store.attempts())[0].status).toBe('cancelled');
    await features.save({ version: 1, enabled: featurePreset(true) }, 'owner');
    await workspace.delivery.run();
    expect((await store.attempts())[0].status).toBe('cancelled');
    await db('ops_outbox').update({
      createdAt: new Date(Date.now() - 61000).toISOString(),
    });
    await workspace.testNotification();
    await workspace.delivery.run();
    expect((await store.attempts())[0].status).toBe('simulated');
  } finally {
    integrations.close();
    await db.destroy();
  }
});

it('checks the AI feature at every MCP invocation before reading evidence', async () => {
  const register = jest.fn();
  const provider = jest.fn(async () => ({
    schemaVersion: 1 as const,
    source: 'none' as const,
    observations: [],
  }));
  let enabled = false;
  registerAgentActions(
    { register } as unknown as ActionsRegistryService,
    createEvidenceService({
      provider,
      mode: 'unconfigured',
      maxAgeSeconds: 300,
      onError: jest.fn(),
    }),
    () => enabled,
  );
  const actions = register.mock.calls.map(([action]) => action);
  for (const action of actions)
    await expect(
      action.action({ input: { intent: 'incident', id: 'health' } }),
    ).rejects.toThrow('disabled');
  expect(provider).not.toHaveBeenCalled();
  enabled = true;
  await actions
    .find(action => action.name === 'get-overview')
    .action({ input: {} });
  expect(provider).toHaveBeenCalledTimes(1);
});

it('interrupts active connection tests and retains the profile when its module is disabled', async () => {
  const db = database();
  const cfg = new ConfigReader({
    opsCompass: {
      mode: 'snapshot',
      features: { defaults: { connections: true } },
      connections: {
        testing: {
          enabled: true,
          aws: [
            {
              profile: 'sample',
              expectedAccountId: '000000000000',
              regions: ['eu-west-1'],
            },
          ],
        },
      },
    },
  });
  try {
    const store = new OperationsStore(db);
    await store.init();
    const features = new FeatureService(store, cfg);
    await features.init();
    const probe = new ConnectionProbe(
      cfg,
      async (_file, _args, signal) =>
        new Promise(resolve => {
          const cancel = () =>
            resolve({ code: 1, stdout: '', stderr: '', timedOut: true });
          if (signal.aborted) cancel();
          else signal.addEventListener('abort', cancel, { once: true });
        }),
    );
    const connections: ConnectionService = new ConnectionService(
      store,
      probe,
      () => {},
      () => features.enabled('connections'),
    );
    await connections.init();
    features.setChangeHandler(async (_before, after) => {
      if (!after.enabled.connections) await connections.cancelActive();
    });
    const profile = await connections.save(
      {
        name: 'Synthetic',
        environment: 'test',
        enabled: true,
        draft: {
          kind: 'aws',
          profile: 'sample',
          expectedAccountId: '000000000000',
          regions: ['eu-west-1'],
          snapshotDirectory: '/private',
        },
      },
      'owner',
    );
    await connections.test(profile.id, { version: 1 }, 'owner');
    await features.save({ version: 0, enabled: featurePreset(false) }, 'owner');
    expect((await connections.list())[0].lastTest?.status).toBe('interrupted');
    await expect(
      connections.test(profile.id, { version: 1 }, 'owner'),
    ).rejects.toThrow('disabled');
    await connections.close();
  } finally {
    await db.destroy();
  }
});
