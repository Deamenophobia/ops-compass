import { randomUUID } from 'node:crypto';
import {
  NotificationAttempt,
  NotificationSettings,
} from '@ops-compass/operations-common';
import { Database } from './database';

export type PendingNotification = {
  kind: 'test' | 'transition';
  subject: string;
  text: string;
  settings: NotificationSettings;
  routeHash: string;
  simulated: boolean;
};
export type NotificationJob = {
  id: string;
  kind: string;
  createdAt: string;
  status: NotificationAttempt['status'];
  attemptCount: number;
  firstAttemptAt: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  hadUncertainty: boolean;
  receivedAt: string | null;
  receivedBy: string | null;
  error: string | null;
  payload: string;
};

export class OutboxStore {
  constructor(private readonly db: Database) {}

  async enqueue(
    input: PendingNotification,
    dedupeKey: string,
    db = this.db,
    now = Date.now(),
  ) {
    const createdAt = new Date(now).toISOString();
    await db('ops_outbox')
      .insert({
        id: randomUUID(),
        dedupeKey,
        kind: input.kind,
        createdAt,
        status: 'queued',
        nextAttemptAt: createdAt,
        payload: JSON.stringify(input),
      })
      .onConflict('dedupeKey')
      .ignore();
  }

  async enqueueTest(input: PendingNotification, now = Date.now()) {
    await this.db.transaction(async transaction => {
      const recent = await transaction('ops_outbox')
        .where({ kind: 'test' })
        .where('createdAt', '>', new Date(now - 60000).toISOString())
        .first();
      if (recent) throw new Error('Wait one minute between test messages');
      await this.enqueue(input, `test-${randomUUID()}`, transaction, now);
    });
  }

  async attempts(): Promise<NotificationAttempt[]> {
    const rows: NotificationJob[] = await this.db('ops_outbox')
      .orderBy('createdAt', 'desc')
      .orderBy('id')
      .limit(100);
    // Never return queued destinations, message bodies, or configuration fingerprints.
    return rows.map(row => this.view(row));
  }

  private view(row: NotificationJob): NotificationAttempt {
    return {
      id: row.id,
      subject: JSON.parse(row.payload).subject,
      createdAt: row.createdAt,
      status: row.status,
      attemptCount: row.attemptCount,
      nextAttemptAt: row.nextAttemptAt ?? undefined,
      lastAttemptAt: row.lastAttemptAt ?? undefined,
      receivedAt: row.receivedAt ?? undefined,
      receivedBy: row.receivedBy ?? undefined,
      error: row.error ?? undefined,
    };
  }

  async summary() {
    const result: Record<NotificationAttempt['status'], number> = {
      queued: 0,
      sending: 0,
      retrying: 0,
      accepted: 0,
      failed: 0,
      simulated: 0,
      uncertain: 0,
      cancelled: 0,
    };
    const rows = await this.db('ops_outbox')
      .select('status')
      .count<
        Array<{ status: NotificationAttempt['status']; total: string | number }>
      >({ total: '*' })
      .groupBy('status');
    for (const row of rows) result[row.status] = Number(row.total);
    return result;
  }

  async abandoned(now: number): Promise<NotificationJob[]> {
    return this.db('ops_outbox')
      .where({ status: 'sending' })
      .where('lastAttemptAt', '<=', new Date(now - 120000).toISOString())
      .limit(100);
  }

  async next(now: number): Promise<NotificationJob | undefined> {
    return this.db('ops_outbox')
      .whereIn('status', ['queued', 'retrying'])
      .where('nextAttemptAt', '<=', new Date(now).toISOString())
      .orderBy('createdAt')
      .orderBy('id')
      .first();
  }

  async update(job: NotificationJob, changes: Partial<NotificationJob>) {
    return this.db('ops_outbox')
      .where({ id: job.id, status: job.status, attemptCount: job.attemptCount })
      .update(changes);
  }

  async claim(
    job: NotificationJob,
    now: number,
  ): Promise<NotificationJob | undefined> {
    const time = new Date(now).toISOString();
    const changes = {
      status: 'sending' as const,
      attemptCount: job.attemptCount + 1,
      firstAttemptAt: job.firstAttemptAt ?? time,
      lastAttemptAt: time,
      nextAttemptAt: null,
    };
    return (await this.update(job, changes))
      ? { ...job, ...changes }
      : undefined;
  }

  async cancel(id: string) {
    await this.db.transaction(async transaction => {
      const row: NotificationJob | undefined = await transaction('ops_outbox')
        .where({ id })
        .first();
      if (!row || !['queued', 'retrying'].includes(row.status))
        throw new Error('Only waiting jobs can be cancelled');
      const cancelled = await transaction('ops_outbox')
        .where({ id, status: row.status, attemptCount: row.attemptCount })
        .update({
          status: row.hadUncertainty ? 'uncertain' : 'cancelled',
          nextAttemptAt: null,
          error: row.hadUncertainty
            ? 'Retries cancelled; provider acceptance remains unverified.'
            : 'Cancelled by an owner before delivery.',
        });
      if (!cancelled) throw new Error('Delivery was already claimed');
    });
  }

  async cancelWaiting(db: Database, transitionsOnly: boolean) {
    let query = db('ops_outbox').whereIn('status', ['queued', 'retrying']);
    if (transitionsOnly) query = query.where({ kind: 'transition' });
    await query.update({
      status: db.raw('CASE WHEN ?? THEN ? ELSE ? END', [
        'hadUncertainty',
        'uncertain',
        'cancelled',
      ]),
      nextAttemptAt: null,
      error:
        'Notification settings changed; waiting delivery stopped. Any earlier uncertain acceptance still needs review.',
    });
  }

  async acknowledge(id: string, actor: string) {
    const job: NotificationJob | undefined = await this.db('ops_outbox')
      .where({ id })
      .first();
    if (!job || !['accepted', 'simulated'].includes(job.status))
      throw new Error('No accepted notification with this ID');
    await this.db('ops_outbox').where({ id }).whereNull('receivedAt').update({
      receivedAt: new Date().toISOString(),
      receivedBy: actor,
    });
    return this.view(await this.db('ops_outbox').where({ id }).first());
  }
}
