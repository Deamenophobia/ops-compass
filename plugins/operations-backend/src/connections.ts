import { randomUUID } from 'node:crypto';
import { z } from 'zod/v3';
import {
  ConnectionTest,
  ConnectionTestInput,
  SavedConnection,
  SavedConnectionInput,
  savedConnectionSchema,
  savedConnectionInputSchema,
} from '@ops-compass/operations-common';
import { OperationsStore } from './store';
import { ConnectionProbe } from './connectionProbe';

const key = 'connections-v1';
const records = z.array(savedConnectionSchema).max(25);
export class ConnectionError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
export class ConnectionService {
  private readonly active = new Map<
    string,
    { controller: AbortController; done: Promise<void> }
  >();
  private closing = false;
  constructor(
    private readonly store: OperationsStore,
    readonly probe: ConnectionProbe,
    private readonly onError = () => {},
    private readonly enabled = () => true,
  ) {}
  private update(change: (items: SavedConnection[]) => SavedConnection[]) {
    // Existing single-instance journal serialization makes version checks and a
    // complete JSON-state replacement atomic. No new physical table is needed.
    return this.store.update<SavedConnection[]>(key, value =>
      records.parse(change(records.parse(value ?? []))),
    );
  }
  async init() {
    await this.update(items =>
      items.map(item =>
        item.lastTest?.status === 'running'
          ? {
              ...item,
              lastTest: {
                ...item.lastTest,
                status: 'interrupted',
                finishedAt: new Date().toISOString(),
                checks: [
                  {
                    target: 'Test execution',
                    status: 'blocked',
                    detail:
                      'The backend restarted during this test. Run a new test; no automatic retry occurred.',
                  },
                ],
              },
            }
          : item,
      ),
    );
  }
  async list() {
    return records.parse((await this.store.get(key)) ?? []);
  }
  async save(
    input: SavedConnectionInput,
    actor: string,
    id?: string,
    version?: number,
  ) {
    const data = savedConnectionInputSchema.parse(input);
    if (!this.enabled())
      throw new ConnectionError(403, 'Connections are disabled.');
    let saved!: SavedConnection;
    await this.update(items => {
      const previous = id ? items.find(item => item.id === id) : undefined;
      if (id && !previous)
        throw new ConnectionError(404, 'Connection not found.');
      if (previous && previous.version !== version)
        throw new ConnectionError(
          409,
          'This profile changed. Reload it before saving.',
        );
      if (!id && items.length >= 25)
        throw new ConnectionError(
          409,
          'The workspace supports at most 25 saved connections.',
        );
      if (
        items.some(
          item =>
            item.id !== id &&
            item.name.toLowerCase() === data.name.toLowerCase(),
        )
      )
        throw new ConnectionError(409, 'Choose a unique connection name.');
      saved = {
        ...data,
        id: id ?? randomUUID(),
        version: (previous?.version ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        updatedBy: actor,
      };
      return previous
        ? items.map(item => (item.id === id ? saved : item))
        : [...items, saved];
    });
    // An edited/disabled target invalidates its test. A completed old probe must
    // never attach a pass to the replacement profile revision.
    if (id) this.active.get(id)?.controller.abort();
    return saved;
  }
  async test(id: string, input: ConnectionTestInput, actor: string) {
    if (!this.enabled())
      throw new ConnectionError(403, 'Connections are disabled.');
    if (this.closing)
      throw new ConnectionError(503, 'The backend is shutting down.');
    if (this.probe.mode === 'disabled')
      throw new ConnectionError(
        409,
        'Live connection testing is disabled in backend configuration.',
      );
    if (this.probe.mode !== 'simulated' && input.scenario)
      throw new ConnectionError(
        400,
        'Simulation scenarios are available only in demo mode.',
      );
    if (this.active.has(id))
      throw new ConnectionError(
        409,
        'A test is already running for this connection.',
      );
    if (this.active.size >= 2)
      throw new ConnectionError(
        429,
        'Two connection tests are already running. Try again after one finishes.',
      );
    let finish!: () => void;
    const entry = {
      controller: new AbortController(),
      done: new Promise<void>(resolve => {
        finish = resolve;
      }),
    };
    this.active.set(id, entry);
    let profile!: SavedConnection;
    try {
      await this.update(items =>
        items.map(item => {
          if (item.id !== id) return item;
          if (item.version !== input.version)
            throw new ConnectionError(
              409,
              'This profile changed. Reload it before testing.',
            );
          if (!item.enabled)
            throw new ConnectionError(
              409,
              'Enable the profile before testing it.',
            );
          if (
            item.lastTest &&
            Date.now() - Date.parse(item.lastTest.startedAt) < 10000
          )
            throw new ConnectionError(
              429,
              'Wait ten seconds between tests of this profile.',
            );
          profile = {
            ...item,
            lastTest: {
              id: randomUUID(),
              version: item.version,
              source: this.probe.mode === 'simulated' ? 'simulated' : 'live',
              status: 'running',
              startedAt: new Date().toISOString(),
              actor,
              checks: [],
            },
          };
          return profile;
        }),
      );
      if (!profile) throw new ConnectionError(404, 'Connection not found.');
      void this.perform(profile, input, entry.controller)
        .catch(this.onError)
        .finally(() => {
          this.active.delete(id);
          finish();
        });
      return profile.lastTest!;
    } catch (error) {
      this.active.delete(id);
      finish();
      throw error;
    }
  }
  private async perform(
    profile: SavedConnection,
    input: ConnectionTestInput,
    controller: AbortController,
  ) {
    const timer = setTimeout(() => controller.abort(), 60000);
    let outcome: ConnectionTest;
    try {
      const checks = await this.probe.test(
        profile.draft,
        controller.signal,
        input.scenario,
      );
      let status: ConnectionTest['status'] = 'passed';
      if (checks.some(check => check.status === 'blocked')) status = 'blocked';
      if (!checks.length || checks.some(check => check.status === 'failed'))
        status = 'failed';
      if (controller.signal.aborted) status = 'interrupted';
      outcome = {
        ...profile.lastTest!,
        status,
        checks,
        finishedAt: new Date().toISOString(),
      };
    } catch {
      outcome = {
        ...profile.lastTest!,
        status: 'failed',
        checks: [
          {
            target: 'Test execution',
            status: 'failed',
            detail:
              'The check could not complete. No access has been verified.',
          },
        ],
        finishedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timer);
    }
    await this.update(items =>
      items.map(item =>
        item.id === profile.id &&
        item.version === profile.version &&
        item.lastTest?.id === profile.lastTest?.id
          ? { ...item, lastTest: outcome }
          : item,
      ),
    );
  }
  async settle() {
    await Promise.all([...this.active.values()].map(entry => entry.done));
  }
  async cancelActive() {
    for (const entry of this.active.values()) entry.controller.abort();
    await this.settle();
  }
  async close() {
    this.closing = true;
    for (const entry of this.active.values()) entry.controller.abort();
    await this.settle();
  }
}
