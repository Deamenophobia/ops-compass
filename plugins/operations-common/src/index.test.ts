import { evaluateSnapshot, snapshotSchema } from './index';

const now = new Date('2026-09-25T00:00:00Z');
const observation = {
  id: 'disk',
  entityRef: 'resource:default/sample-host',
  label: 'Disk',
  environment: 'demo',
  region: 'eu-west-1',
  state: 'healthy',
  observedAt: now.toISOString(),
  summary: 'Root disk 40% used',
};
const snapshot = (overrides = {}) => ({
  schemaVersion: 1,
  source: 'ssh',
  observations: [{ ...observation, ...overrides }],
});

it('accepts current evidence but changes stale healthy evidence to unknown', () => {
  expect(evaluateSnapshot(snapshot(), 'snapshot', 300, now).overall).toBe(
    'healthy',
  );
  const result = evaluateSnapshot(
    snapshot({ observedAt: '2026-09-24T23:54:59Z' }),
    'snapshot',
    300,
    now,
  );
  expect(result.overall).toBe('unknown');
  expect(result.observations[0]).toMatchObject({
    freshness: 'stale',
    reportedState: 'healthy',
    state: 'unknown',
  });
});

it('does not treat empty, future-dated or unknown evidence as healthy', () => {
  expect(
    evaluateSnapshot({ ...snapshot(), observations: [] }, 'snapshot', 300, now)
      .overall,
  ).toBe('unknown');
  expect(
    evaluateSnapshot(
      snapshot({ observedAt: '2026-09-25T01:00:00Z' }),
      'snapshot',
      300,
      now,
    ).observations[0].freshness,
  ).toBe('future');
  expect(
    evaluateSnapshot(snapshot({ state: 'unknown' }), 'snapshot', 300, now)
      .overall,
  ).toBe('unknown');
});

it('keeps critical visible even when other evidence is missing', () => {
  const input = snapshot();
  input.observations.push({ ...observation, id: 'alarm', state: 'critical' });
  input.observations.push({ ...observation, id: 'missing', state: 'unknown' });
  expect(evaluateSnapshot(input, 'snapshot', 300, now)).toMatchObject({
    overall: 'critical',
    counts: { critical: 1, unknown: 1 },
  });
});

it('rejects malformed timestamps, duplicate observations and unsafe ages', () => {
  expect(() =>
    snapshotSchema.parse(snapshot({ observedAt: 'yesterday' })),
  ).toThrow();
  expect(() =>
    snapshotSchema.parse({
      ...snapshot(),
      observations: [observation, observation],
    }),
  ).toThrow();
  expect(() =>
    evaluateSnapshot(snapshot(), 'snapshot', Number.NaN, now),
  ).toThrow();
});

it('distinguishes running containers, heartbeat freshness and certificate expiry', () => {
  const result = evaluateSnapshot(
    {
      schemaVersion: 1,
      source: 'ssh',
      observations: [],
      services: [
        {
          id: 'worker',
          name: 'Worker',
          entityRef: 'component:default/worker',
          host: 'test',
          environment: 'test',
          observedAt: now.toISOString(),
          containers: [
            {
              name: 'worker',
              image: 'test:1',
              state: 'running',
              health: 'not-configured',
              restartCount: null,
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
    },
    'snapshot',
    300,
    now,
  );
  expect(result.counts).toEqual({
    healthy: 0,
    critical: 0,
    warning: 1,
    unknown: 2,
  });
  expect(
    result.observations.find(o => o.id === 'worker-heartbeat')?.freshness,
  ).toBe('stale');
});
