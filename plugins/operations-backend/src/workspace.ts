import { Config } from '@backstage/config';
import {
  Deployment,
  NotificationSettings,
  Notifications,
  OperationEvent,
  Overview,
  Snapshot,
  Workspace,
  evaluateSnapshot,
  FeatureId,
  notificationSettingsSchema,
} from '@ops-compass/operations-common';
import { configuredProvider } from './providers';
import { OperationsStore } from './store';
import { Integrations } from './integrations';
import { NotificationWorker } from './notificationWorker';
import { PendingNotification } from './outboxStore';

const emptySettings: NotificationSettings = {
  provider: 'disabled',
  recipient: '',
  sender: '',
  automatic: false,
};
type Source = ReturnType<typeof configuredProvider>;

export class WorkspaceService {
  private pending?: Promise<void>;
  private testPending = false;
  private testDone?: Promise<void>;
  readonly delivery: NotificationWorker;
  constructor(
    readonly store: OperationsStore,
    readonly source: Source,
    readonly integrations: Integrations,
    readonly mode: Overview['mode'],
    readonly maxAgeSeconds: number,
    readonly config: Config,
    readonly enabled: (id: FeatureId) => boolean = () => true,
  ) {
    this.delivery = new NotificationWorker(
      store.outbox,
      integrations,
      () => this.settings(),
      mode === 'demo',
      Date.now,
      () => this.enabled('notifications'),
    );
  }
  get isDemo() {
    return this.mode === 'demo';
  }
  private get sourceName(): Snapshot['source'] {
    if (this.mode === 'unconfigured') return 'none';
    if (this.mode === 'snapshot') return 'ssh';
    return this.mode;
  }
  async settings() {
    return notificationSettingsSchema.parse(
      (await this.store.get('notification-settings')) ?? emptySettings,
    );
  }
  async saveSettings(settings: NotificationSettings, actor: string) {
    await this.store.saveNotificationSettings(settings, actor);
  }
  async notifications(canWrite: boolean): Promise<Notifications> {
    const settings = await this.settings();
    let subscriptions: Notifications['subscriptions'] = {
      status: 'not-applicable',
    };
    if (!this.isDemo && settings.provider === 'sns') {
      try {
        subscriptions = await this.integrations.subscriptions();
      } catch {
        subscriptions = { status: 'unavailable' };
      }
    }
    return {
      settings,
      available: this.integrations.available,
      simulated: this.isDemo,
      canWrite,
      subscriptions,
      ...(await this.notificationProgress()),
    };
  }
  async notificationProgress() {
    return {
      attempts: await this.store.attempts(),
      queue: await this.store.outbox.summary(),
      worker: {
        intervalSeconds: NotificationWorker.intervalSeconds,
        lastRunAt: this.delivery.lastRunAt,
      },
    };
  }
  testNotification() {
    if (this.testPending)
      return Promise.reject(new Error('A test is already in progress'));
    this.testDone = this.enqueueNotificationTest();
    return this.testDone;
  }
  async pauseNotifications() {
    // An admitted test may still be writing its queue entry. Drain both the enqueue
    // and provider work before cancelling, so re-enable cannot replay that entry.
    await this.testDone?.catch(() => undefined);
    await this.delivery.drain();
    await this.store.pauseNotifications();
  }
  private async enqueueNotificationTest() {
    if (!this.enabled('notifications'))
      throw new Error('Notifications disabled');
    if (this.testPending) throw new Error('A test is already in progress');
    this.testPending = true;
    try {
      const settings = await this.settings();
      if (!this.enabled('notifications'))
        throw new Error('Notifications disabled');
      if (
        !this.isDemo &&
        (settings.provider === 'disabled' ||
          !this.integrations.available[settings.provider])
      )
        throw new Error('Configure the notification provider first');
      await this.store.outbox.enqueueTest({
        kind: 'test',
        subject: '[Ops Compass] Monitoring test',
        text: 'This is an operator-requested monitoring test. Confirm receipt in Ops Compass only after checking your inbox.',
        settings,
        routeHash: this.integrations.notificationRoute(settings),
        simulated: this.isDemo,
      });
    } finally {
      this.testPending = false;
    }
  }

  async read(canWrite: boolean): Promise<Workspace> {
    let snapshot: Snapshot = {
      schemaVersion: 1,
      source: this.sourceName,
      observations: [],
    };
    let sourceStatus: Workspace['sourceStatus'] = 'available';
    try {
      if (
        this.enabled('services') ||
        this.enabled('maintenance') ||
        (this.isDemo && this.enabled('costs'))
      )
        snapshot = await this.source.provider();
    } catch {
      sourceStatus = 'unavailable';
    }
    let deployments: Workspace['deployments'] = {
      status: 'unconfigured',
      items: [],
    };
    let costs: Workspace['costs'] = { status: 'unconfigured' };
    if (this.isDemo) {
      deployments = {
        status: sourceStatus === 'unavailable' ? 'unavailable' : 'available',
        items: this.enabled('services') ? snapshot.deployments ?? [] : [],
      };
      costs = {
        status:
          this.enabled('costs') && snapshot.budget
            ? 'available'
            : 'unconfigured',
        budget: this.enabled('costs') ? snapshot.budget : undefined,
      };
    } else {
      if (this.enabled('services') && this.integrations.hasGitLab) {
        try {
          deployments = {
            status: 'available',
            items: await this.integrations.deployments(),
          };
        } catch {
          deployments = { status: 'unavailable', items: [] };
        }
      }
      if (this.enabled('costs') && this.integrations.hasBudget) {
        try {
          costs = {
            status: 'available',
            budget: await this.integrations.budget(),
          };
        } catch {
          costs = { status: 'unavailable' };
        }
      }
    }
    if (this.enabled('costs'))
      costs.preference = await this.store.get('budget-preference');
    let services: Workspace['services'] = [];
    if (this.enabled('services')) services = snapshot.services ?? [];
    else if (this.enabled('maintenance'))
      services = (snapshot.services ?? []).map(service => ({
        ...service,
        containers: [],
      }));
    return {
      source: snapshot.source,
      sourceStatus,
      evaluatedAt: new Date().toISOString(),
      maxAgeSeconds: this.maxAgeSeconds,
      canWrite,
      services,
      deployments,
      costs,
      scenarios: this.source.scenarios ?? [],
      activeScenario: this.source.activeScenario?.(),
      backups: this.enabled('maintenance')
        ? (await this.store.get('backups')) ?? []
        : [],
    };
  }

  async collect() {
    if (
      !this.enabled('history') &&
      !this.enabled('worklogs') &&
      !this.enabled('notifications')
    )
      return Promise.resolve();
    if (!this.pending)
      this.pending = this.collectOnce().finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  async settle() {
    await this.testDone?.catch(() => undefined);
    await this.delivery.stop();
    await this.pending;
  }
  private async collectOnce() {
    if (this.mode === 'unconfigured') return;
    let snapshot: Snapshot;
    const base = { actor: 'monitor', source: this.sourceName, serviceId: '' };
    const settings = await this.settings();
    try {
      snapshot = await this.source.provider();
    } catch {
      await this.store.change(
        'source-status',
        'unavailable',
        {
          ...base,
          kind: 'source',
          title: 'Observation source unavailable',
          detail:
            'Current evidence could not be read. Previous readings remain historical only.',
        },
        (event, previous) =>
          this.transitionMessage(event, 'unknown', previous, settings),
      );
      return;
    }
    await this.store.change(
      'source-status',
      'available',
      {
        ...base,
        kind: 'source',
        title: 'Observation source available',
        detail: 'The configured source returned a valid snapshot.',
      },
      (event, previous) =>
        previous === 'unavailable'
          ? this.transitionMessage(event, 'healthy', 'unknown', settings)
          : undefined,
    );
    const overview = evaluateSnapshot(snapshot, this.mode, this.maxAgeSeconds);
    for (const observation of overview.observations) {
      const serviceId =
        snapshot.services?.find(s => s.entityRef === observation.entityRef)
          ?.id ?? '';
      await this.store.change(
        `health:${observation.id}`,
        observation.state,
        {
          ...base,
          serviceId,
          kind: 'health',
          observedAt: observation.observedAt,
          title: `${observation.label}: ${observation.state}`,
          detail: `${observation.summary} Freshness: ${observation.freshness}; reported state: ${observation.reportedState}.`,
        },
        (event, previous) =>
          this.transitionMessage(event, observation.state, previous, settings),
      );
    }
    let deployments: Deployment[] = this.enabled('services')
      ? snapshot.deployments ?? []
      : [];
    if (
      this.enabled('services') &&
      !this.isDemo &&
      this.integrations.hasGitLab
    ) {
      try {
        deployments = await this.integrations.deployments();
        await this.store.change('gitlab-status', 'available', {
          ...base,
          kind: 'source',
          title: 'GitLab pipeline source available',
          detail:
            'The configured projects returned valid pipeline observations.',
        });
      } catch {
        await this.store.change('gitlab-status', 'unavailable', {
          ...base,
          kind: 'source',
          title: 'GitLab pipeline source unavailable',
          detail:
            'Pipeline status is unknown; no old result is promoted to current.',
        });
      }
    }
    for (const deployment of deployments) {
      await this.store.change(
        `pipeline:${deployment.serviceId}`,
        [deployment.sha, deployment.status],
        {
          ...base,
          kind: 'deployment',
          serviceId: deployment.serviceId,
          observedAt: deployment.observedAt,
          title: `${deployment.project}: pipeline ${deployment.status}`,
          detail: `Commit ${deployment.sha} on ${deployment.ref}. Pipeline completion does not prove deployment.`,
        },
      );
    }
    for (const service of this.enabled('services')
      ? snapshot.services ?? []
      : []) {
      for (const container of service.containers) {
        await this.store.change(
          `container:${service.id}:${container.name}`,
          [
            container.imageId,
            container.revision,
            container.restartCount,
            container.state,
            container.health,
          ],
          {
            ...base,
            kind: 'deployment',
            serviceId: service.id,
            observedAt: container.observedAt,
            title: `${service.name} / ${container.name}: runtime observation`,
            detail: `Image ${container.image}; revision ${
              container.revision ?? 'unknown'
            }; restarts ${container.restartCount}; state ${
              container.state
            }; health ${container.health}.`,
          },
        );
      }
    }
  }
  private transitionMessage(
    event: OperationEvent,
    state: string,
    previous: unknown,
    settings: NotificationSettings,
  ): PendingNotification | undefined {
    if (
      !this.enabled('notifications') ||
      !settings.automatic ||
      settings.provider === 'disabled'
    )
      return undefined;
    // Establish a healthy baseline quietly; only observed bad states and their
    // recovery produce messages. A source recovery is not a service recovery.
    if (
      state === 'healthy' &&
      (previous === undefined ||
        previous === 'healthy' ||
        previous === 'available')
    )
      return undefined;
    return {
      kind: 'transition',
      settings,
      simulated: this.isDemo,
      routeHash: this.integrations.notificationRoute(settings),
      subject: `[Ops Compass] ${state === 'healthy' ? 'Recovery' : 'Alert'}: ${
        event.title
      }`.slice(0, 100),
      text: `${event.title}\nRecorded: ${event.createdAt}\nObserved: ${
        event.observedAt ?? 'unavailable'
      }\n${event.detail}\nEvent ${
        event.id
      }. Review the health runbook and verify the affected service.`,
    };
  }
}

export function draftWorklog(title: string, events: OperationEvent[]) {
  const escape = (value: string) => value.replace(/[\\`*_{}\[\]<>#]/g, '\\$&');
  return `# ${escape(title)}\n\n## Evidence reviewed\n\n${events
    .map(
      event =>
        `- Event ${event.id} · ${event.createdAt} · ${escape(
          event.source,
        )}: ${escape(event.title)}\n  ${escape(event.detail)}${
          event.observedAt ? `\n  Observation time: ${event.observedAt}` : ''
        }`,
    )
    .join(
      '\n',
    )}\n\n## Actions actually performed\n\nNot supplied. Record only actions you performed.\n\n## Verification\n\nNot supplied. Record the outcome and supporting evidence.\n\n## Remaining work\n\nReview the selected events and record follow-up work.\n`;
}
