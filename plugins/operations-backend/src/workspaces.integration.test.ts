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
import operations from './index';
import { delegatedTestAuth } from './__testUtils__/permissions';
import { createServiceFactory } from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { actionsRegistryServiceMock } from '@backstage/backend-test-utils/alpha';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const kubernetesFixture = JSON.parse(
  readFileSync(
    join(__dirname, '../../../examples/kubernetes-snapshot.example.json'),
    'utf8',
  ),
);

const owner = 'user:default/owner';
const member = 'user:default/member';
const stranger = 'user:default/stranger';

it('enforces native Backstage conditions across workspace APIs and regular-member writes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ops-kubernetes-access-'));
  const kubernetesFile = join(directory, 'snapshot.json');
  await writeFile(
    kubernetesFile,
    JSON.stringify({ ...kubernetesFixture, source: 'kubernetes-api' }),
  );
  const actions = actionsRegistryServiceMock();
  const backend = await startTestBackend({
    features: [
      createServiceFactory({
        service: actionsRegistryServiceRef,
        deps: {},
        async factory() {
          return actions;
        },
      }),
      mockServices.rootConfig.factory({
        data: {
          permission: { enabled: true },
          opsCompass: {
            profile: 'team',
            mode: 'unconfigured',
            writers: [owner],
            kubernetes: { file: kubernetesFile },
            features: {
              defaults: {
                costs: true,
                maintenance: true,
                worklogs: true,
                agent: true,
                kubernetes: true,
              },
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
  try {
    const api = request(backend.server);
    const diagnostic = await api
      .post('/api/permission/authorize')
      .set('Authorization', mockCredentials.user.header(owner))
      .send({
        items: [
          {
            id: 'test',
            resourceRef: 'personal',
            permission: {
              type: 'resource',
              name: 'ops.workspace.read',
              attributes: { action: 'read' },
              resourceType: 'ops-compass-workspace',
            },
          },
        ],
      });
    expect(diagnostic.body).toMatchObject({ items: [{ result: 'ALLOW' }] });
    const get = (path: string, user: string, workspace = 'personal') =>
      api
        .get(`/api/operations${path}`)
        .set('Authorization', mockCredentials.user.header(user))
        .set('X-Ops-Workspace', workspace);
    const post = (
      path: string,
      user: string,
      body: object,
      workspace = 'personal',
    ) =>
      api
        .post(`/api/operations${path}`)
        .set('Authorization', mockCredentials.user.header(user))
        .set('X-Ops-Workspace', workspace)
        .send(body);
    expect((await get('/workspaces', owner)).body.items).toHaveLength(1);
    expect((await get('/workspaces', stranger)).body.items).toEqual([]);
    expect((await get('/overview', stranger)).status).toBe(403);
    expect((await get('/kubernetes', stranger)).status).toBe(403);
    expect((await get('/kubernetes', owner)).body.targets[0].cluster).toBe(
      'example-cluster',
    );
    const readAction = [...actions.actions.keys()].find(key =>
      key.endsWith('get-overview'),
    )!;
    await expect(
      actions.invoke({
        id: readAction,
        input: {},
        credentials: mockCredentials.user(stranger),
      }),
    ).rejects.toThrow();
    await expect(
      actions.invoke({
        id: readAction,
        input: {},
        credentials: mockCredentials.service(),
      }),
    ).rejects.toThrow();
    expect(
      await actions.invoke({
        id: readAction,
        input: {},
        credentials: mockCredentials.user(owner),
      }),
    ).toMatchObject({ output: { overview: { source: 'none' } } });
    expect(
      (
        await post('/workspaces/personal/members', owner, {
          version: 0,
          userEntityRef: member,
          role: 'user',
        })
      ).status,
    ).toBe(200);
    expect((await get('/overview', member)).status).toBe(200);
    expect((await get('/kubernetes', member)).status).toBe(200);
    const settings = await get('/features', member);
    expect(settings.body.canWrite).toBe(false);
    expect(
      (
        await post('/features', member, {
          version: settings.body.version,
          enabled: settings.body.enabled,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post('/budget-preference', member, {
          amount: 20,
          currency: 'USD',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post('/workspaces/personal/members', member, {
          version: 1,
          userEntityRef: member,
          role: 'admin',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post('/workspaces/personal/members', owner, {
          version: 1,
          userEntityRef: owner,
          role: null,
        })
      ).status,
    ).toBe(409);
    const created = await post('/workspaces', member, {
      name: 'Team services',
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect((await get('/overview', member, id)).status).toBe(200);
    expect((await get('/features', member, id)).body.canWrite).toBe(true);
    expect(
      Object.values((await get('/features', member, id)).body.enabled).every(
        value => value === false,
      ),
    ).toBe(true);
    expect((await get('/Kubernetes/', member, id)).body.code).toBe(
      'FEATURE_DISABLED',
    );
    const isolatedFeatures = (await get('/features', member, id)).body;
    expect(
      (
        await post(
          '/features',
          member,
          {
            version: isolatedFeatures.version,
            enabled: { ...isolatedFeatures.enabled, kubernetes: true },
          },
          id,
        )
      ).status,
    ).toBe(200);
    // Enabling a second workspace must not inherit the owner's snapshot path.
    expect((await get('/kubernetes', member, id)).body).toMatchObject({
      source: 'none',
      targets: [],
    });
    expect((await get('/kubernetes', owner, id)).status).toBe(403);
    await expect(
      actions.invoke({
        id: readAction,
        input: { workspaceId: id },
        credentials: mockCredentials.user(member),
      }),
    ).rejects.toThrow('disabled');
    const contributed = await post('/workspace/refresh', member, {});
    expect(contributed.status).toBe(200);
    expect(contributed.body).toMatchObject({ canWrite: true, canAdmin: false });
    expect((await get('/overview', owner, id)).status).toBe(403);
    expect((await get('/workspaces/personal', member)).status).toBe(403);
    expect((await get('/overview', owner, '../personal')).status).toBe(400);
    // Removing membership takes effect on the next API request; the selector grants nothing.
    expect(
      (
        await post('/workspaces/personal/members', owner, {
          version: 1,
          userEntityRef: member,
          role: null,
        })
      ).status,
    ).toBe(200);
    expect((await get('/overview', member)).status).toBe(403);
    expect((await get('/kubernetes', member)).status).toBe(403);
    const service = await api
      .get('/api/operations/overview')
      .set('Authorization', mockCredentials.service.header());
    expect(service.status).toBe(403);
  } finally {
    await backend.stop();
    await rm(directory, { recursive: true, force: true });
  }
}, 60000);

it('keeps personal mode single-workspace and blocks user/service escalation', async () => {
  const backend = await startTestBackend({
    features: [
      mockServices.rootConfig.factory({
        data: {
          permission: { enabled: true },
          opsCompass: { mode: 'unconfigured', writers: [owner] },
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
  try {
    const api = request(backend.server);
    const result = await api
      .get('/api/operations/workspaces')
      .set('Authorization', mockCredentials.user.header(owner));
    expect(result.body.profile).toBe('personal');
    expect(result.body.canCreate).toBe(false);
    expect(
      (
        await api
          .post('/api/operations/workspaces')
          .set('Authorization', mockCredentials.user.header(owner))
          .send({ name: 'No extra workspace' })
      ).status,
    ).toBe(403);
    expect(
      (
        await api
          .post('/api/operations/features')
          .set('Authorization', mockCredentials.service.header())
          .send({ version: 0, enabled: {} })
      ).status,
    ).toBe(403);
  } finally {
    await backend.stop();
  }
}, 60000);
