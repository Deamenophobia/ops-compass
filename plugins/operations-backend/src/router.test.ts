import express from 'express';
import request from 'supertest';
import {
  mockCredentials,
  mockServices,
  startTestBackend,
} from '@backstage/backend-test-utils';
import { createRouter } from './router';
import { SnapshotProvider } from './providers';
import operationsPlugin from './index';
import { featurePreset } from '@ops-compass/operations-common';

const testProvider: SnapshotProvider = async () => ({
  schemaVersion: 1,
  source: 'ssh',
  observations: [0, 1, 2].map(index => ({
    id: `check-${index}`,
    entityRef: 'resource:default/test-host',
    label: `Test check ${index}`,
    environment: 'test',
    region: 'test',
    state: index === 1 ? 'warning' : 'healthy',
    observedAt: new Date(
      Date.now() - (index === 2 ? 3600000 : 0),
    ).toISOString(),
    summary: 'Test evidence',
  })),
});

it('returns evaluated observations and prevents cached healthy responses', async () => {
  const app = express().use(
    createRouter({
      provider: testProvider,
      mode: 'snapshot',
      maxAgeSeconds: 300,
      onError: jest.fn(),
    }),
  );
  const response = await request(app).get('/overview').expect(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toMatchObject({
    mode: 'snapshot',
    counts: { healthy: 1, warning: 1, unknown: 1 },
  });
});

it('returns 503 without leaking filesystem paths or provider errors', async () => {
  const onError = jest.fn();
  const app = express().use(
    createRouter({
      provider: async () => {
        throw new Error('secret path and account id');
      },
      mode: 'snapshot',
      maxAgeSeconds: 300,
      onError,
    }),
  );
  const response = await request(app).get('/overview').expect(503);
  expect(JSON.stringify(response.body)).not.toContain('secret path');
  expect(onError).toHaveBeenCalled();
  await request(app).post('/overview').expect(404);
});

it('uses the actual Backstage authentication boundary', async () => {
  const { server } = await startTestBackend({
    features: [
      operationsPlugin,
      mockServices.rootConfig.factory({
        data: {
          opsCompass: { mode: 'unconfigured', writers: ['user:default/owner'] },
        },
      }),
      mockServices.httpAuth.factory({
        defaultCredentials: mockCredentials.none(),
      }),
    ],
  });
  await request(server)
    .get('/api/operations/overview')
    .timeout({ deadline: 5000 })
    .expect(401);
  await request(server)
    .get('/api/operations/agent/context?intent=incident')
    .expect(401);
  await request(server)
    .get('/api/operations/agent/runbooks/health')
    .expect(401);
  await request(server).get('/api/operations/connections').expect(401);
  await request(server).get('/api/operations/features').expect(401);
  const owner = mockCredentials.user.header('user:default/owner');
  const initial = await request(server)
    .get('/api/operations/features')
    .set('Authorization', owner)
    .expect(200);
  expect(initial.body.enabled).toEqual(featurePreset(false));
  await request(server)
    .get('/api/operations/inventory')
    .set('Authorization', owner)
    .expect(403);
  for (const token of [
    mockCredentials.service.header(),
    mockCredentials.user.header('user:default/visitor'),
  ]) {
    await request(server)
      .post('/api/operations/features')
      .set('Authorization', token)
      .send({ version: 0, enabled: featurePreset(true) })
      .expect(403);
  }
  await request(server)
    .post('/api/operations/features')
    .set('Authorization', owner)
    .send({ version: 0, enabled: featurePreset(true) })
    .expect(200);
  await request(server)
    .post('/api/operations/features')
    .set('Authorization', owner)
    .send({ version: 0, enabled: featurePreset(false) })
    .expect(409);
  for (const token of [
    mockCredentials.service.header(),
    mockCredentials.user.header('user:default/visitor'),
  ]) {
    await request(server)
      .post('/api/operations/connections')
      .set('Authorization', token)
      .send({})
      .expect(403);
    await request(server)
      .post(
        '/api/operations/connections/00000000-0000-4000-8000-000000000000/test',
      )
      .set('Authorization', token)
      .send({ version: 1 })
      .expect(403);
  }
  const profile = await request(server)
    .post('/api/operations/connections')
    .set('Authorization', mockCredentials.user.header('user:default/owner'))
    .send({
      name: 'Test profile',
      environment: 'test',
      enabled: true,
      draft: {
        kind: 'aws',
        expectedAccountId: '000000000000',
        regions: ['eu-west-1'],
        profile: '',
        snapshotDirectory: '/private',
      },
    })
    .expect(201);
  await request(server)
    .post(`/api/operations/connections/${profile.body.id}/test`)
    .set('Authorization', mockCredentials.user.header('user:default/owner'))
    .send({ version: 1 })
    .expect(409);
  const response = await request(server)
    .get('/api/operations/overview')
    .set('Authorization', mockCredentials.user.header())
    .timeout({ deadline: 5000 })
    .expect(200);
  expect(response.body).toMatchObject({
    mode: 'unconfigured',
    source: 'none',
    overall: 'unknown',
    observations: [],
  });
  await request(server)
    .post('/api/operations/budget-preference')
    .set('Authorization', mockCredentials.service.header())
    .send({ amount: 20, currency: 'USD' })
    .expect(403);
  await request(server)
    .post(
      '/api/operations/notifications/00000000-0000-4000-8000-000000000000/cancel',
    )
    .set('Authorization', mockCredentials.service.header())
    .send({})
    .expect(403);
  await request(server)
    .post('/api/operations/budget-preference')
    .set('Authorization', mockCredentials.user.header('user:default/visitor'))
    .send({ amount: 20, currency: 'USD' })
    .expect(403);
  await request(server)
    .post('/api/operations/budget-preference')
    .set('Authorization', mockCredentials.user.header('user:default/owner'))
    .send({ amount: 20, currency: 'USD' })
    .expect(200);
  await request(server)
    .post('/api/operations/workspace/scenario')
    .set('Authorization', mockCredentials.user.header('user:default/owner'))
    .send({ id: 'not-present-on-main' })
    .expect(404);
  await request(server)
    .post('/api/operations/features')
    .set('Authorization', owner)
    .send({ version: 1, enabled: featurePreset(false) })
    .expect(200);
  for (const path of [
    '/connections',
    '/inventory',
    '/workspace',
    '/events',
    '/documents',
    '/notifications',
    '/agent/context?intent=incident',
  ]) {
    const disabled = await request(server)
      .get(`/api/operations${path}`)
      .set('Authorization', owner)
      .expect(403);
    expect(disabled.body.code).toBe('FEATURE_DISABLED');
  }
  await request(server)
    .get('/api/operations/overview')
    .set('Authorization', owner)
    .expect(200);
}, 30000);

it('validates the agent API and serves only curated runbooks', async () => {
  const app = express().use(
    createRouter({
      provider: testProvider,
      mode: 'snapshot',
      maxAgeSeconds: 300,
      onError: jest.fn(),
    }),
  );
  const response = await request(app)
    .get('/agent/context?intent=worklog')
    .expect(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toMatchObject({
    kind: 'evidence-context',
    intent: 'worklog',
    overview: { mode: 'snapshot' },
  });
  await request(app).get('/agent/context?intent=execute').expect(400);
  await request(app)
    .get('/agent/context?intent=incident&command=reboot')
    .expect(400);
  await request(app)
    .get('/agent/context?intent=incident&observationId=missing')
    .expect(404);
  await request(app).get('/agent/runbooks/health').expect(200);
  await request(app).get('/agent/runbooks/secrets').expect(404);
  await request(app).post('/agent/context').expect(404);
});

it('returns no previous context when a source becomes unavailable', async () => {
  const provider = jest.fn(testProvider);
  const app = express().use(
    createRouter({
      provider,
      mode: 'snapshot',
      maxAgeSeconds: 300,
      onError: jest.fn(),
    }),
  );
  await request(app).get('/agent/context?intent=incident').expect(200);
  provider.mockRejectedValueOnce(new Error('private source failure'));
  const response = await request(app)
    .get('/agent/context?intent=incident')
    .expect(503);
  expect(response.body.overview).toBeUndefined();
  expect(JSON.stringify(response.body)).not.toContain('private source failure');
});
