import knex from 'knex';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigReader } from '@backstage/config';
import { SavedConnectionInput } from '@ops-compass/operations-common';
import { OperationsStore } from './store';
import { ConnectionService } from './connections';
import { ConnectionProbe, ProbeRunner } from './connectionProbe';

const input: SavedConnectionInput = {
  name: 'My inventory',
  environment: 'test',
  enabled: true,
  draft: {
    kind: 'aws',
    expectedAccountId: '000000000000',
    regions: ['eu-west-1'],
    profile: 'test',
    snapshotDirectory: '/private',
  },
};
const live = () =>
  new ConfigReader({
    opsCompass: {
      mode: 'unconfigured',
      connections: {
        testing: {
          enabled: true,
          aws: [
            {
              profile: 'test',
              expectedAccountId: '000000000000',
              regions: ['eu-west-1', 'eu-west-2'],
            },
          ],
          sshAliases: ['test-host'],
        },
      },
    },
  });
const signal = () => new AbortController().signal;
const ok = { stdout: '', stderr: '', code: 0 };
const denied = {
  stdout: '',
  stderr: 'An error occurred (UnauthorizedOperation) PRIVATE_SECRET',
  code: 255,
};

it('blocks disabled and unapproved targets before any subprocess, and demo always simulates', async () => {
  const runner = jest.fn<ReturnType<ProbeRunner>, Parameters<ProbeRunner>>();
  const disabled = new ConnectionProbe(
    new ConfigReader({ opsCompass: { mode: 'unconfigured' } }),
    runner,
  );
  expect((await disabled.test(input.draft, signal()))[0].status).toBe(
    'blocked',
  );
  const allowed = new ConnectionProbe(live(), runner);
  expect(
    (
      await allowed.test(
        { ...input.draft, kind: 'aws', profile: 'other' } as typeof input.draft,
        signal(),
      )
    )[0].status,
  ).toBe('blocked');
  const demo = new ConnectionProbe(
    new ConfigReader({
      opsCompass: { mode: 'demo', connections: { testing: { enabled: true } } },
    }),
    runner,
  );
  expect((await demo.test(input.draft, signal()))[0].detail).toContain(
    'Simulation',
  );
  expect((await demo.test(input.draft, signal(), 'denied'))[0].status).toBe(
    'failed',
  );
  expect(runner).not.toHaveBeenCalled();
});

it('refuses mismatched AWS identity before EC2 and only accepts the dry-run permission signal', async () => {
  const runner = jest.fn<ReturnType<ProbeRunner>, Parameters<ProbeRunner>>();
  runner.mockResolvedValueOnce({ ...ok, stdout: '"111111111111"' });
  const probe = new ConnectionProbe(live(), runner);
  expect((await probe.test(input.draft, signal()))[0].status).toBe('failed');
  expect(runner).toHaveBeenCalledTimes(1);
  runner.mockResolvedValueOnce({ ...ok, stdout: '"000000000000"' });
  runner.mockResolvedValueOnce({
    ...denied,
    stderr: 'An error occurred (DryRunOperation): authorized',
  });
  const checks = await probe.test(input.draft, signal());
  expect(checks.map(check => check.status)).toEqual(['passed', 'passed']);
  expect(runner.mock.calls[2][1]).toEqual(
    expect.arrayContaining(['--dry-run', '--page-size', '5']),
  );
  expect(runner.mock.calls[2][1]).not.toContain('--endpoint-url');
});

it('keeps partial regional failure and strips provider diagnostics', async () => {
  const runner = jest.fn<ReturnType<ProbeRunner>, Parameters<ProbeRunner>>();
  runner
    .mockResolvedValueOnce({ ...ok, stdout: '"000000000000"' })
    .mockResolvedValueOnce({ ...denied, stderr: '(DryRunOperation)' })
    .mockResolvedValueOnce(denied);
  const checks = await new ConnectionProbe(live(), runner).test(
    {
      ...input.draft,
      kind: 'aws',
      regions: ['eu-west-1', 'eu-west-2'],
    } as typeof input.draft,
    signal(),
  );
  expect(checks.map(check => check.status)).toEqual([
    'passed',
    'passed',
    'failed',
  ]);
  expect(JSON.stringify(checks)).not.toContain('PRIVATE_SECRET');
});

it('checks only approved SSH aliases, with host-key verification and a fixed prerequisite program', async () => {
  const draft = {
    kind: 'ssh' as const,
    snapshotDirectory: '/private',
    targets: [
      {
        id: 'host',
        sshAlias: 'test-host',
        label: 'Host',
        entityRef: 'resource:default/host',
        environment: 'test',
        region: 'test',
        checkDocker: true,
        minimumRunning: 1,
      },
    ],
  };
  const runner = jest
    .fn<ReturnType<ProbeRunner>, Parameters<ProbeRunner>>()
    .mockResolvedValue({ ...ok, stdout: '{"python":3,"docker":true}' });
  const probe = new ConnectionProbe(live(), runner);
  expect(
    (
      await probe.test(
        {
          ...draft,
          targets: [
            ...draft.targets,
            { ...draft.targets[0], sshAlias: 'unapproved' },
          ],
        },
        signal(),
      )
    )[0].status,
  ).toBe('blocked');
  expect(runner).not.toHaveBeenCalled();
  expect((await probe.test(draft, signal()))[0].status).toBe('passed');
  const [, args, , program] = runner.mock.calls[0];
  expect(args).toEqual(
    expect.arrayContaining([
      'StrictHostKeyChecking=yes',
      'BatchMode=yes',
      'ClearAllForwardings=yes',
      'PermitLocalCommand=no',
      'test-host',
      'python3',
      '-',
    ]),
  );
  expect(program).toContain('subprocess.DEVNULL');
  expect(program).not.toContain('test-host');
  runner.mockResolvedValue({ ...ok, stdout: '{"python":3,"docker":false}' });
  expect((await probe.test(draft, signal()))[0].status).toBe('failed');
});

it('does not spawn after cancellation and handles timeout/missing clients without raw output', async () => {
  const runner = jest.fn<ReturnType<ProbeRunner>, Parameters<ProbeRunner>>();
  const probe = new ConnectionProbe(live(), runner);
  const controller = new AbortController();
  controller.abort();
  expect((await probe.test(input.draft, controller.signal))[0].status).toBe(
    'failed',
  );
  expect(runner).not.toHaveBeenCalled();
  runner.mockResolvedValue({ ...ok, code: 'ENOENT', stderr: 'private path' });
  expect((await probe.test(input.draft, signal()))[0].detail).toContain(
    'not installed',
  );
});

async function fixture(mode = 'demo', runner?: ProbeRunner) {
  const db = knex({
    client: 'better-sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });
  const store = new OperationsStore(db);
  await store.init();
  const service = new ConnectionService(
    store,
    new ConnectionProbe(
      mode === 'demo' ? new ConfigReader({ opsCompass: { mode } }) : live(),
      runner,
    ),
  );
  await service.init();
  return { db, store, service };
}

it('persists profile/test records, refuses stale edits and clears verification when disabled', async () => {
  const { db, service } = await fixture();
  try {
    const profile = await service.save(input, 'owner');
    await service.test(profile.id, { version: 1 }, 'owner');
    await service.settle();
    expect((await service.list())[0].lastTest).toMatchObject({
      status: 'passed',
      source: 'simulated',
      actor: 'owner',
      version: 1,
    });
    await expect(
      service.test(profile.id, { version: 1 }, 'owner'),
    ).rejects.toMatchObject({ status: 429 });
    const disabled = await service.save(
      { ...input, enabled: false },
      'owner',
      profile.id,
      1,
    );
    expect(disabled.version).toBe(2);
    expect(disabled.lastTest).toBeUndefined();
    await expect(
      service.save(input, 'owner', profile.id, 1),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.test(profile.id, { version: 2 }, 'owner'),
    ).rejects.toMatchObject({ status: 409 });
    await expect(service.save(input, 'owner')).rejects.toMatchObject({
      status: 409,
    });
  } finally {
    await service.close();
    await db.destroy();
  }
});

it('bounds concurrent tests and settles cancelled work before shutdown', async () => {
  const runner: ProbeRunner = async (_file, _args, abort) =>
    new Promise(resolve => {
      abort.addEventListener(
        'abort',
        () => resolve({ ...ok, code: 'ABORT_ERR', timedOut: true }),
        { once: true },
      );
    });
  const { db, service } = await fixture('unconfigured', runner);
  try {
    const first = await service.save(input, 'owner');
    const second = await service.save({ ...input, name: 'Second' }, 'owner');
    const third = await service.save({ ...input, name: 'Third' }, 'owner');
    await service.test(first.id, { version: 1 }, 'owner');
    await service.test(second.id, { version: 1 }, 'owner');
    await expect(
      service.test(third.id, { version: 1 }, 'owner'),
    ).rejects.toMatchObject({ status: 429 });
    await service.close();
    expect(
      (await service.list())
        .slice(0, 2)
        .map(profile => profile.lastTest?.status),
    ).toEqual(['interrupted', 'interrupted']);
    await expect(
      service.test(third.id, { version: 1 }, 'owner'),
    ).rejects.toMatchObject({ status: 503 });
  } finally {
    await service.close();
    await db.destroy();
  }
});

it('cancels in-flight tests on edit and never attaches a late pass to the new revision', async () => {
  let reply!: (value: typeof ok) => void;
  const runner = jest
    .fn<ReturnType<ProbeRunner>, Parameters<ProbeRunner>>()
    .mockImplementation(
      () =>
        new Promise(resolve => {
          reply = resolve;
        }),
    );
  const { db, service } = await fixture('unconfigured', runner);
  try {
    const profile = await service.save(input, 'owner');
    await service.test(profile.id, { version: 1 }, 'owner');
    await expect(
      service.test(profile.id, { version: 1 }, 'owner'),
    ).rejects.toMatchObject({ status: 409 });
    await service.save({ ...input, name: 'Changed' }, 'owner', profile.id, 1);
    expect(runner.mock.calls[0][2].aborted).toBe(true);
    reply({ ...ok, stdout: '"000000000000"' });
    await service.settle();
    expect((await service.list())[0]).toMatchObject({
      version: 2,
      name: 'Changed',
    });
    expect((await service.list())[0].lastTest).toBeUndefined();
    expect(runner).toHaveBeenCalledTimes(1);
  } finally {
    await service.close();
    await db.destroy();
  }
});

it('recovers an interrupted test after database reopen without replaying it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ops-connections-'));
  const filename = join(directory, 'journal.sqlite');
  const open = () =>
    knex({
      client: 'better-sqlite3',
      connection: { filename },
      useNullAsDefault: true,
    });
  let db = open();
  try {
    let store = new OperationsStore(db);
    await store.init();
    const service = new ConnectionService(
      store,
      new ConnectionProbe(new ConfigReader({ opsCompass: { mode: 'demo' } })),
    );
    const profile = await service.save(input, 'owner');
    await store.put('connections-v1', [
      {
        ...profile,
        lastTest: {
          id: profile.id,
          version: 1,
          source: 'live',
          status: 'running',
          startedAt: new Date().toISOString(),
          actor: 'owner',
          checks: [],
        },
      },
    ]);
    await db.destroy();
    db = open();
    store = new OperationsStore(db);
    await store.init();
    const runner = jest.fn<ReturnType<ProbeRunner>, Parameters<ProbeRunner>>();
    const reopened = new ConnectionService(
      store,
      new ConnectionProbe(live(), runner),
    );
    await reopened.init();
    expect((await reopened.list())[0]).toMatchObject({
      name: input.name,
      lastTest: { status: 'interrupted' },
    });
    expect(runner).not.toHaveBeenCalled();
  } finally {
    await db.destroy();
    await unlink(filename);
    await rmdir(directory);
  }
});
