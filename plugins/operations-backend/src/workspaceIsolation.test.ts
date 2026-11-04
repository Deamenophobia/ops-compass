import knex from 'knex';
import { ConfigReader } from '@backstage/config';
import { OperationsStore } from './store';
import { FeatureService } from './features';
import { PendingNotification } from './outboxStore';

const secondId = '2b4e3c6b-8cc0-4b65-975b-d66a02d5b082';
it('isolates settings, features, documents, event IDs and every outbox transition', async () => {
  const db = knex({
    client: 'better-sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });
  try {
    const personal = new OperationsStore(db);
    await personal.init();
    const second = new OperationsStore(db, secondId);
    await personal.put('budget-preference', { amount: 99 });
    await second.put('budget-preference', { amount: 10 });
    expect(await personal.get('budget-preference')).toEqual({ amount: 99 });
    expect(await second.get('budget-preference')).toEqual({ amount: 10 });
    const doc = await personal.saveDocument({
      kind: 'note',
      serviceId: '',
      title: 'Private note',
      markdown: 'Private content',
      actor: 'user:default/owner',
    });
    const [event] = await personal.events();
    expect(await second.documents()).toEqual([]);
    expect(await second.document(doc.id)).toBeUndefined();
    expect(await second.events({ ids: [event.id] })).toEqual([]);
    const config = new ConfigReader({ opsCompass: { mode: 'unconfigured' } });
    const firstFeatures = new FeatureService(personal, config);
    const secondFeatures = new FeatureService(second, config);
    await firstFeatures.init();
    await secondFeatures.init();
    await firstFeatures.save(
      { version: 0, enabled: { ...firstFeatures.read().enabled, agent: true } },
      'owner',
    );
    expect(secondFeatures.enabled('agent')).toBe(false);
    const input: PendingNotification = {
      kind: 'test',
      subject: 'Test',
      text: 'Private test',
      settings: {
        provider: 'disabled',
        automatic: false,
        sender: '',
        recipient: '',
      },
      routeHash: 'test',
      simulated: true,
    };
    await personal.outbox.enqueue(input, 'same-key');
    await second.outbox.enqueue(input, 'same-key');
    const firstJob = (await personal.outbox.next(Date.now()))!;
    expect(firstJob).toBeDefined();
    expect((await second.outbox.next(Date.now()))?.id).not.toBe(firstJob.id);
    expect(await second.outbox.claim(firstJob, Date.now())).toBeUndefined();
    await expect(second.outbox.cancel(firstJob.id)).rejects.toThrow();
    await expect(
      second.outbox.acknowledge(firstJob.id, 'intruder'),
    ).rejects.toThrow();
    await personal.pauseNotifications();
    expect((await personal.outbox.summary()).cancelled).toBe(1);
    expect((await second.outbox.summary()).queued).toBe(1);
  } finally {
    await db.destroy();
  }
});
