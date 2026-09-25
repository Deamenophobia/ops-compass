import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigReader } from '@backstage/config';
import {
  Snapshot,
  evaluateSnapshot,
  snapshotSchema,
} from '@ops-compass/operations-common';
import {
  configuredProvider,
  cloudWatchProvider,
  demoProvider,
  fileProvider,
} from './providers';

const now = new Date('2026-09-25T00:00:00Z');
const fixture: Snapshot = {
  schemaVersion: 1,
  source: 'demo',
  observations: [0, 1].map(index => ({
    id: `test-${index}`,
    entityRef: 'resource:default/test-host',
    label: 'Test observation',
    environment: 'test',
    region: 'test',
    state: 'healthy',
    observedAt: new Date(now.getTime() - index * 3600000).toISOString(),
    summary: 'Synthetic test input',
  })),
};
const targets = [
  {
    name: 'sample-cpu',
    id: 'cpu',
    label: 'CPU',
    entityRef: 'resource:default/sample-host',
    environment: 'demo',
  },
];

it('reads only configured metric alarms and timestamps the successful query', async () => {
  const send = jest.fn().mockResolvedValue({
    MetricAlarms: [
      {
        AlarmName: 'sample-cpu',
        StateValue: 'OK',
        StateUpdatedTimestamp: new Date('2025-01-01T00:00:00Z'),
      },
    ],
  });
  const result = await cloudWatchProvider(
    { send },
    'eu-west-1',
    targets,
    () => now,
  )();
  expect(send.mock.calls[0][0].input).toMatchObject({
    AlarmNames: ['sample-cpu'],
    AlarmTypes: ['MetricAlarm'],
  });
  expect(result.observations[0]).toMatchObject({
    state: 'healthy',
    observedAt: now.toISOString(),
    stateChangedAt: '2025-01-01T00:00:00.000Z',
  });
});

it('keeps missing and insufficient-data alarms unknown and propagates API failure', async () => {
  const send = jest
    .fn()
    .mockResolvedValueOnce({ MetricAlarms: [] })
    .mockResolvedValueOnce({
      MetricAlarms: [
        { AlarmName: 'sample-cpu', StateValue: 'INSUFFICIENT_DATA' },
      ],
    })
    .mockRejectedValueOnce(new Error('denied'));
  const provider = cloudWatchProvider({ send }, 'eu-west-1', targets);
  expect((await provider()).observations[0].state).toBe('unknown');
  expect((await provider()).observations[0].state).toBe('unknown');
  await expect(provider()).rejects.toThrow('denied');
});

it('follows pages and maps ALARM to critical', async () => {
  const send = jest
    .fn()
    .mockResolvedValueOnce({ NextToken: 'next' })
    .mockResolvedValueOnce({
      MetricAlarms: [{ AlarmName: 'sample-cpu', StateValue: 'ALARM' }],
    });
  expect(
    (await cloudWatchProvider({ send }, 'eu-west-1', targets)()).observations[0]
      .state,
  ).toBe('critical');
  expect(send.mock.calls[1][0].input.NextToken).toBe('next');
});

it('rejects empty alarm configuration and unsupported modes', () => {
  expect(() =>
    cloudWatchProvider({ send: jest.fn() }, 'eu-west-1', []),
  ).toThrow();
  expect(() =>
    configuredProvider(new ConfigReader({ opsCompass: { mode: 'typo' } })),
  ).toThrow();
});

it('reads real snapshot files but rejects demo files and invalid JSON', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ops-compass-test-'));
  const file = join(directory, 'snapshot.json');
  try {
    const snapshot = fixture;
    await writeFile(file, JSON.stringify(snapshot));
    await expect(fileProvider(file)()).rejects.toThrow('requires SSH');
    await writeFile(file, JSON.stringify({ ...snapshot, source: 'ssh' }));
    expect((await fileProvider(file)()).source).toBe('ssh');
    await writeFile(file, '{broken');
    await expect(fileProvider(file)()).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('starts empty without substituting demo or healthy evidence', async () => {
  const { provider } = configuredProvider(
    new ConfigReader({ opsCompass: { mode: 'unconfigured' } }),
  );
  expect(evaluateSnapshot(await provider(), 'unconfigured', 300)).toMatchObject(
    {
      source: 'none',
      overall: 'unknown',
      observations: [],
      counts: { healthy: 0, warning: 0, critical: 0, unknown: 0 },
    },
  );
  expect(() => snapshotSchema.parse({ ...fixture, source: 'none' })).toThrow();
  expect(() =>
    configuredProvider(new ConfigReader({ opsCompass: { mode: 'demo' } })),
  ).toThrow();
});

it('replays only explicit synthetic fixtures and preserves stale ages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ops-compass-replay-test-'));
  const file = join(directory, 'fixture.json');
  const later = new Date('2027-01-01T00:00:00Z');
  try {
    await writeFile(file, JSON.stringify(fixture));
    const replay = await demoProvider(file, () => later)();
    expect(replay.observations[0].observedAt).toBe(later.toISOString());
    expect(evaluateSnapshot(replay, 'demo', 300, later).counts).toEqual({
      healthy: 1,
      warning: 0,
      critical: 0,
      unknown: 1,
    });
    await writeFile(file, JSON.stringify({ ...fixture, source: 'ssh' }));
    await expect(demoProvider(file)()).rejects.toThrow('requires synthetic');
    expect((await fileProvider(file)()).observations).toEqual(
      fixture.observations,
    );
    await writeFile(file, JSON.stringify({ ...fixture, observations: [] }));
    expect((await demoProvider(file)()).observations).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('preserves heartbeat and certificate offsets when replaying service evidence', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'ops-compass-service-replay-'),
  );
  const file = join(directory, 'fixture.json');
  const later = new Date('2027-01-01T00:00:00Z');
  try {
    await writeFile(
      file,
      JSON.stringify({
        ...fixture,
        services: [
          {
            id: 'worker',
            name: 'Worker',
            entityRef: 'component:default/worker',
            host: 'demo-host',
            environment: 'demo',
            observedAt: now.toISOString(),
            containers: [
              {
                name: 'worker',
                image: 'example/worker:1',
                state: 'running',
                health: 'passing',
                restartCount: 0,
                observedAt: now.toISOString(),
              },
            ],
            heartbeat: {
              lastSeenAt: new Date(now.getTime() - 120000).toISOString(),
              maxAgeSeconds: 60,
            },
            certificate: {
              hostname: 'example.com',
              checkedAt: now.toISOString(),
              expiresAt: new Date(now.getTime() + 86400000).toISOString(),
            },
          },
        ],
      }),
    );
    const replay = await demoProvider(file, () => later)();
    expect(replay.services![0].heartbeat!.lastSeenAt).toBe(
      '2026-12-31T23:58:00.000Z',
    );
    expect(replay.services![0].certificate!.expiresAt).toBe(
      '2027-01-02T00:00:00.000Z',
    );
    const checks = evaluateSnapshot(replay, 'demo', 300, later).observations;
    expect(checks.find(o => o.id === 'worker-heartbeat')).toMatchObject({
      state: 'unknown',
      freshness: 'stale',
    });
    expect(checks.find(o => o.id === 'worker-certificate')?.state).toBe(
      'warning',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
