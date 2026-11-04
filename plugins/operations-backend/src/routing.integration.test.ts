import request from 'supertest';
import {
  mockCredentials,
  mockServices,
  startTestBackend,
} from '@backstage/backend-test-utils';
import { permissionsServiceFactory } from '@backstage/backend-defaults/permissions';
import { permissionsRegistryServiceFactory } from '@backstage/backend-defaults/permissionsRegistry';
import permissionBackend from '@backstage/plugin-permission-backend';
import { workspacePermissionModule } from '@ops-compass/core-node';
import { delegatedTestAuth } from './__testUtils__/permissions';
import operations from './index';

const owner = 'user:default/owner';
const member = 'user:default/member';
let backend: Awaited<ReturnType<typeof startTestBackend>>;
let eventId: number;
const get = (path: string) =>
  request(backend.server)
    .get(`/api/operations${path}`)
    .set('Authorization', mockCredentials.user.header(member));
const post = (path: string, body: object, user = member) =>
  request(backend.server)
    .post(`/api/operations${path}`)
    .set('Authorization', mockCredentials.user.header(user))
    .send(body);

beforeAll(async () => {
  backend = await startTestBackend({
    features: [
      mockServices.rootConfig.factory({
        data: {
          permission: { enabled: true },
          opsCompass: {
            profile: 'team',
            mode: 'unconfigured',
            writers: [owner],
            features: {
              defaults: { costs: true, worklogs: true, notifications: true },
            },
          },
        },
      }),
      delegatedTestAuth,
      permissionsServiceFactory,
      permissionsRegistryServiceFactory,
      permissionBackend,
      workspacePermissionModule,
      operations,
    ],
  });
  await post(
    '/workspaces/personal/members',
    {
      version: 0,
      userEntityRef: member,
      role: 'user',
    },
    owner,
  ).expect(200);
  await post(
    '/budget-preference',
    { amount: 10, currency: 'USD' },
    owner,
  ).expect(200);
  eventId = (await get('/events').expect(200)).body.items[0].id;
}, 60000);

afterAll(async () => {
  await backend?.stop();
});

it.each([
  '/connections',
  '/Connections/',
  '/INVENTORY',
  '/Agent/context?intent=incident',
])('enforces feature admission for Express route variant %s', async path => {
  const result = await get(path).expect(403);
  expect(result.body.code).toBe('FEATURE_DISABLED');
});

it.each([
  ['/budget-preference', { amount: 20, currency: 'USD' }],
  ['/Budget-Preference/', { amount: 20, currency: 'USD' }],
  [
    '/NOTIFICATIONS/settings',
    { provider: 'disabled', recipient: '', sender: '', automatic: false },
  ],
  ['/Workspace/Scenario', { id: 'missing' }],
])('requires admin for Express route variant %s', async (path, body) => {
  await post(path as string, body as object).expect(403);
});

it.each(['a'.repeat(20000), '界'.repeat(32000)])(
  'accepts a worklog within the character limit through the complete router stack (%#)',
  async markdown => {
    const created = await post('/worklogs', {
      title: 'Long worklog',
      eventIds: [eventId],
      markdown,
    }).expect(201);
    const stored = await get(`/documents/${created.body.id}`).expect(200);
    expect(stored.body.markdown).toContain(markdown);
  },
);

it('keeps small configuration payloads bounded', async () => {
  await post('/features', { padding: 'a'.repeat(20000) }, owner).expect(413);
});
