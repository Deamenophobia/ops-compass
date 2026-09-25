import knex from 'knex';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigReader } from '@backstage/config';
import { NotificationSettings } from '@ops-compass/operations-common';
import { OperationsStore } from './store';
import { Integrations } from './integrations';
import { NotificationWorker } from './notificationWorker';
import { PendingNotification } from './outboxStore';
import { DeliveryError, retryWindowMs } from './delivery';

const config = new ConfigReader({
  opsCompass: {
    notifications: {
      resendApiKey: 'test-only-key',
      snsTopicArn: 'arn:aws:sns:eu-west-1:000000000000:test',
      snsRegion: 'eu-west-1',
    },
  },
});
const settings: NotificationSettings = {
  provider: 'resend',
  recipient: 'owner@example.com',
  sender: 'alerts@example.com',
  automatic: true,
};
const createDb = (filename = ':memory:') =>
  knex({
    client: 'better-sqlite3',
    connection: filename === ':memory:' ? filename : { filename },
    useNullAsDefault: true,
  });

function fixture(store: OperationsStore) {
  let now = Date.now() + 1000;
  let current = { ...settings };
  const integrations = new Integrations(config);
  const send = jest.spyOn(integrations, 'send').mockResolvedValue(undefined);
  const input: PendingNotification = {
    kind: 'transition',
    subject: 'Alert',
    text: 'Original evidence',
    settings: current,
    routeHash: integrations.notificationRoute(current),
    simulated: false,
  };
  const worker = new NotificationWorker(
    store.outbox,
    integrations,
    async () => current,
    false,
    () => now,
  );
  return {
    input,
    worker,
    send,
    integrations,
    time: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    change: (next: NotificationSettings) => {
      current = next;
    },
  };
}

it('commits transition and delivery intent atomically, including enqueue failure and concurrent duplicate polls', async () => {
  const db = createDb();
  try {
    const store = new OperationsStore(db);
    await store.init();
    const f = fixture(store);
    const event = {
      kind: 'health' as const,
      serviceId: 'worker',
      title: 'Failure',
      detail: 'Observed',
      actor: 'monitor',
      source: 'ssh',
    };
    const enqueue = jest
      .spyOn(store.outbox, 'enqueue')
      .mockRejectedValueOnce(new Error('disk write failed'));
    await expect(
      store.change('health', 'critical', event, () => f.input),
    ).rejects.toThrow('disk write failed');
    expect(await store.get('health')).toBeUndefined();
    expect(await store.events()).toHaveLength(0);
    enqueue.mockRestore();
    await Promise.all([
      store.change('health', 'critical', event, () => f.input),
      store.change('health', 'critical', event, () => f.input),
    ]);
    expect(await store.events()).toHaveLength(1);
    expect(await store.attempts()).toHaveLength(1);
    await Promise.all([f.worker.run(), f.worker.run()]);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect((await store.attempts())[0]).toMatchObject({
      status: 'accepted',
      attemptCount: 1,
    });
    expect(JSON.stringify(await store.attempts())).not.toContain(
      'owner@example.com',
    );
    f.integrations.close();
  } finally {
    await db.destroy();
  }
});

it('recovers queued work after database reopen and reuses the exact Resend payload/key after timeout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ops-outbox-'));
  const filename = join(directory, 'journal.sqlite');
  let db = createDb(filename);
  try {
    let store = new OperationsStore(db);
    await store.init();
    const before = fixture(store);
    await store.outbox.enqueue(before.input, 'event-1');
    const id = (await store.attempts())[0].id;
    before.integrations.close();
    await db.destroy();
    db = createDb(filename);
    store = new OperationsStore(db);
    await store.init();
    const f = fixture(store);
    f.send.mockRejectedValueOnce(new Error('private provider response'));
    await f.worker.run();
    expect((await store.attempts())[0]).toMatchObject({
      id,
      status: 'retrying',
      attemptCount: 1,
    });
    await f.worker.run();
    expect(f.send).toHaveBeenCalledTimes(1);
    f.advance(30001);
    await f.worker.run();
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.send.mock.calls[1]).toEqual(f.send.mock.calls[0]);
    expect((await store.attempts())[0]).toMatchObject({
      id,
      status: 'accepted',
      attemptCount: 2,
    });
    expect((await store.attempts())[0].receivedAt).toBeUndefined();
    expect(JSON.stringify(await store.attempts())).not.toContain(
      'private provider response',
    );
    f.integrations.close();
  } finally {
    await db.destroy();
    await rm(filename);
    await rmdir(directory);
  }
});

it.each(['resend', 'sns'] as const)(
  'handles an abandoned %s claim without unsafe duplicate delivery',
  async provider => {
    const db = createDb();
    try {
      const store = new OperationsStore(db);
      await store.init();
      const f = fixture(store);
      const route = { ...settings, provider };
      f.change(route);
      await store.outbox.enqueue(
        {
          ...f.input,
          settings: route,
          routeHash: f.integrations.notificationRoute(route),
        },
        'event-2',
        undefined,
        f.time(),
      );
      await store.outbox.claim((await store.outbox.next(f.time()))!, f.time());
      await f.worker.run();
      expect(f.send).not.toHaveBeenCalled();
      f.advance(120001);
      await f.worker.run();
      expect(f.send).toHaveBeenCalledTimes(provider === 'resend' ? 1 : 0);
      expect((await store.attempts())[0].status).toBe(
        provider === 'resend' ? 'accepted' : 'uncertain',
      );
      f.integrations.close();
    } finally {
      await db.destroy();
    }
  },
);

it('honors Retry-After and never repeats an uncertain request after the idempotency window', async () => {
  const db = createDb();
  try {
    const store = new OperationsStore(db);
    await store.init();
    const f = fixture(store);
    await store.outbox.enqueue(f.input, 'event-3', undefined, f.time());
    f.send.mockRejectedValueOnce(new DeliveryError('retryable', 120000));
    await f.worker.run();
    f.advance(60000);
    await f.worker.run();
    expect(f.send).toHaveBeenCalledTimes(1);
    f.advance(60001);
    f.send.mockRejectedValueOnce(new Error('timeout'));
    await f.worker.run();
    f.advance(retryWindowMs);
    await f.worker.run();
    expect(f.send).toHaveBeenCalledTimes(2);
    expect((await store.attempts())[0].status).toBe('uncertain');
    f.integrations.close();
  } finally {
    await db.destroy();
  }
});

it('caps retries, stops on rejection and preserves uncertainty from earlier attempts', async () => {
  const db = createDb();
  try {
    const store = new OperationsStore(db);
    await store.init();
    const f = fixture(store);
    await store.outbox.enqueue(f.input, 'event-4', undefined, f.time());
    f.send.mockRejectedValue(new Error('timeout'));
    for (let count = 0; count < 6; count++) {
      await f.worker.run();
      f.advance(2000000);
    }
    expect(f.send).toHaveBeenCalledTimes(5);
    expect((await store.attempts())[0].status).toBe('uncertain');
    f.send.mockReset().mockRejectedValue(new DeliveryError('rejected'));
    await store.outbox.enqueue(f.input, 'event-5', undefined, f.time());
    await f.worker.run();
    f.advance(60000);
    await f.worker.run();
    expect(f.send).toHaveBeenCalledTimes(1);
    expect((await store.attempts())[0].status).toBe('failed');
    f.integrations.close();
  } finally {
    await db.destroy();
  }
});

it('cancels changed routes and owner-cancelled jobs, and keeps demo work isolated', async () => {
  const db = createDb();
  try {
    const store = new OperationsStore(db);
    await store.init();
    const f = fixture(store);
    await store.outbox.enqueue(f.input, 'route-change');
    f.change({ ...settings, recipient: 'someone-else@example.com' });
    await f.worker.run();
    expect(f.send).not.toHaveBeenCalled();
    expect((await store.attempts())[0].status).toBe('cancelled');
    await store.outbox.enqueue(f.input, 'owner-cancel');
    await store.outbox.cancel((await store.outbox.next(f.time()))!.id);
    await store.outbox.enqueue({ ...f.input, simulated: true }, 'demo-on-live');
    await f.worker.run();
    expect(f.send).not.toHaveBeenCalled();
    expect((await store.outbox.summary()).cancelled).toBe(3);
    f.integrations.close();
  } finally {
    await db.destroy();
  }
});

it('leaves a durable claim when recording acceptance fails, then recovers with the same request', async () => {
  const db = createDb();
  try {
    const store = new OperationsStore(db);
    await store.init();
    const f = fixture(store);
    await store.outbox.enqueue(
      f.input,
      'event-acceptance-write',
      undefined,
      f.time(),
    );
    const update = store.outbox.update.bind(store.outbox);
    const persist = jest
      .spyOn(store.outbox, 'update')
      .mockImplementation((job, changes) =>
        changes.status === 'accepted'
          ? Promise.reject(new Error('storage unavailable'))
          : update(job, changes),
      );
    await expect(f.worker.run()).rejects.toThrow('storage unavailable');
    expect((await store.attempts())[0].status).toBe('sending');
    persist.mockRestore();
    f.advance(120001);
    await f.worker.run();
    expect(f.send.mock.calls[1]).toEqual(f.send.mock.calls[0]);
    expect((await store.attempts())[0]).toMatchObject({
      status: 'accepted',
      attemptCount: 2,
    });
    f.integrations.close();
  } finally {
    await db.destroy();
  }
});

it('uses atomic claims across workers and expires never-attempted messages after a day', async () => {
  const db = createDb();
  try {
    const store = new OperationsStore(db);
    await store.init();
    const first = fixture(store);
    const second = fixture(store);
    await store.outbox.enqueue(first.input, 'concurrent-workers');
    await Promise.all([first.worker.run(), second.worker.run()]);
    expect(first.send.mock.calls.length + second.send.mock.calls.length).toBe(
      1,
    );
    await store.outbox.enqueue(
      first.input,
      'old-alert',
      undefined,
      first.time() - 86400001,
    );
    await first.worker.run();
    expect((await store.outbox.summary()).failed).toBe(1);
    expect(first.send.mock.calls.length + second.send.mock.calls.length).toBe(
      1,
    );
    first.integrations.close();
    second.integrations.close();
  } finally {
    await db.destroy();
  }
});

it('atomically disables waiting transitions before a worker with old settings can claim them', async () => {
  const db = createDb();
  try {
    const store = new OperationsStore(db);
    await store.init();
    const f = fixture(store);
    await store.saveNotificationSettings(settings, 'owner');
    await store.outbox.enqueue(
      f.input,
      'waiting-before-disable',
      undefined,
      f.time(),
    );
    const selected = (await store.outbox.next(f.time()))!;
    await store.saveNotificationSettings(
      { ...settings, automatic: false },
      'owner',
    );
    expect(await store.outbox.claim(selected, f.time())).toBeUndefined();
    expect((await store.attempts())[0].status).toBe('cancelled');
    expect(await store.get('notification-settings')).toMatchObject({
      automatic: false,
    });
    f.integrations.close();
  } finally {
    await db.destroy();
  }
});
