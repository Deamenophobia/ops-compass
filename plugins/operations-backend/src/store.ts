import { randomUUID } from 'node:crypto';
import {
  OperationDocument,
  OperationEvent,
  NotificationSettings,
} from '@ops-compass/operations-common';
import { Database } from './database';
import { migrateDatabase } from './migrations';
import { OutboxStore, PendingNotification } from './outboxStore';

type NewEvent = Omit<OperationEvent, 'id' | 'createdAt'>;

/** Durable single-instance journal. Serialize read/modify/write operations so a
 * poll and an operator refresh cannot record or notify the same transition twice. */
export class OperationsStore {
  private queue: Promise<unknown> = Promise.resolve();
  readonly outbox: OutboxStore;
  constructor(private readonly db: Database) {
    this.outbox = new OutboxStore(db);
  }

  async init() {
    await migrateDatabase(this.db);
  }

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const row = await this.db('ops_state').where({ key }).first();
    return row ? JSON.parse(row.value) : undefined;
  }
  async put(key: string, value: unknown) {
    await this.db('ops_state')
      .insert({ key, value: JSON.stringify(value) })
      .onConflict('key')
      .merge();
  }
  async update<T>(key: string, fn: (value: T | undefined) => T) {
    return this.serial(async () => {
      const value = fn(await this.get<T>(key));
      await this.put(key, value);
      return value;
    });
  }
  async saveNotificationSettings(
    settings: NotificationSettings,
    actor: string,
  ) {
    await this.serial(() =>
      this.db.transaction(async transaction => {
        const row = await transaction('ops_state')
          .where({ key: 'notification-settings' })
          .first();
        const previous: NotificationSettings | undefined = row
          ? JSON.parse(row.value)
          : undefined;
        const routeChanged =
          settings.provider === 'disabled' ||
          previous?.provider !== settings.provider ||
          previous?.sender !== settings.sender ||
          previous?.recipient !== settings.recipient;
        await transaction('ops_state')
          .insert({
            key: 'notification-settings',
            value: JSON.stringify(settings),
          })
          .onConflict('key')
          .merge();
        // A worker that read the old settings must fail its conditional claim after
        // this commit. Only a message already marked Sending can still complete.
        if (routeChanged || !settings.automatic)
          await this.outbox.cancelWaiting(transaction, !routeChanged);
        await this.insertEvent(transaction, {
          kind: 'notification',
          serviceId: '',
          title: 'Notification settings updated',
          detail: `Provider: ${settings.provider}; automatic transitions: ${settings.automatic}. Recipients are stored privately.`,
          source: 'user-recorded',
          actor,
        });
      }),
    );
  }
  private async insertEvent(
    db: Database,
    event: NewEvent,
  ): Promise<OperationEvent> {
    const createdAt = new Date().toISOString();
    const [row] = await db('ops_events')
      .insert({
        kind: event.kind,
        serviceId: event.serviceId,
        createdAt,
        data: JSON.stringify(event),
      })
      .returning('id');
    return { ...event, createdAt, id: Number(row.id) };
  }
  async append(event: NewEvent) {
    return this.serial(() => this.insertEvent(this.db, event));
  }

  async change(
    key: string,
    value: unknown,
    event: NewEvent,
    notification?: (
      record: OperationEvent,
      previous: unknown,
    ) => PendingNotification | undefined,
  ) {
    return this.serial(() =>
      this.db.transaction(async transaction => {
        const row = await transaction('ops_state').where({ key }).first();
        const encoded = JSON.stringify(value);
        if (row?.value === encoded) return undefined;
        await transaction('ops_state')
          .insert({ key, value: encoded })
          .onConflict('key')
          .merge();
        const previous = row ? JSON.parse(row.value) : undefined;
        const record = await this.insertEvent(transaction, event);
        const message = notification?.(record, previous);
        // The event, deduplication state and delivery intent commit together.
        // A process crash cannot leave a recorded transition without its queued alert.
        if (message)
          await this.outbox.enqueue(message, `event-${record.id}`, transaction);
        return { event: record, previous };
      }),
    );
  }

  async events(
    options: {
      before?: number;
      kind?: string;
      serviceId?: string;
      ids?: number[];
    } = {},
  ) {
    let query = this.db('ops_events').orderBy('id', 'desc').limit(100);
    if (options.before) query = query.where('id', '<', options.before);
    if (options.kind) query = query.where('kind', options.kind);
    if (options.serviceId) query = query.where('serviceId', options.serviceId);
    if (options.ids) query = query.whereIn('id', options.ids);
    return (await query).map(row => ({
      ...JSON.parse(row.data),
      id: Number(row.id),
      createdAt: row.createdAt,
    })) as OperationEvent[];
  }

  async saveDocument(input: Omit<OperationDocument, 'id' | 'createdAt'>) {
    const document = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await this.serial(() =>
      this.db.transaction(async transaction => {
        await transaction('ops_documents').insert({
          id: document.id,
          kind: document.kind,
          createdAt: document.createdAt,
          data: JSON.stringify(document),
        });
        await this.insertEvent(transaction, {
          kind: input.kind,
          serviceId: input.serviceId,
          title: input.title,
          detail: `Saved document ${document.id}`,
          actor: input.actor,
          source: 'user-recorded',
        });
      }),
    );
    return document;
  }
  async documents() {
    return (
      await this.db('ops_documents').orderBy('createdAt', 'desc').limit(100)
    ).map(row => JSON.parse(row.data)) as OperationDocument[];
  }
  async document(id: string): Promise<OperationDocument | undefined> {
    const row = await this.db('ops_documents').where({ id }).first();
    return row ? JSON.parse(row.data) : undefined;
  }

  async attempts() {
    return this.outbox.attempts();
  }
  async pauseNotifications() {
    await this.serial(() =>
      this.db.transaction(async db => {
        await this.outbox.cancelWaiting(db, false);
        // After the local worker drains, leftover claims came from an interrupted
        // process. Keep their uncertainty; re-enabling must not replay old mail.
        await db('ops_outbox').where({ status: 'sending' }).update({
          status: 'uncertain',
          hadUncertainty: true,
          nextAttemptAt: null,
          error:
            'Notifications disabled during an interrupted delivery. Check provider acceptance before sending again.',
        });
      }),
    );
  }
  async acknowledge(id: string, actor: string) {
    return this.serial(() => this.outbox.acknowledge(id, actor));
  }
}
