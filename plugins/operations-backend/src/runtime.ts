import express from 'express';
import { Config } from '@backstage/config';
import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { WorkspaceActor } from '@ops-compass/core-node';
import { configuredProvider } from './providers';
import { createRouter } from './router';
import { createEvidenceService } from './agent';
import { OperationsStore } from './store';
import { Integrations } from './integrations';
import { WorkspaceService } from './workspace';
import { createWorkspaceRouter } from './workspaceRouter';
import { NotificationWorker } from './notificationWorker';
import { ConnectionService } from './connections';
import { ConnectionProbe } from './connectionProbe';
import { createConnectionsRouter } from './connectionsRouter';
import { FeatureService, createFeatureRouter } from './features';
import { createKubernetesRouter } from './kubernetes';

/** A workspace owns its clients, timers and caches; request selection is never global. */
export async function createOperationsRuntime(options: {
  workspaceId: string;
  database: ConstructorParameters<typeof OperationsStore>[0];
  config: Config;
  httpAuth: HttpAuthService;
  logger: LoggerService;
  actor: WorkspaceActor;
}) {
  const { workspaceId, database, config, httpAuth, logger, actor } = options;
  const mode = config.getString('opsCompass.mode');
  if (
    mode !== 'unconfigured' &&
    mode !== 'demo' &&
    mode !== 'snapshot' &&
    mode !== 'cloudwatch'
  )
    throw new Error('Unsupported observation mode');
  const maxAgeSeconds =
    config.getOptionalNumber('opsCompass.maxAgeSeconds') ?? 300;
  if (
    !Number.isInteger(maxAgeSeconds) ||
    maxAgeSeconds < 1 ||
    maxAgeSeconds > 86400
  )
    throw new Error('Invalid maximum observation age');
  const pollSeconds = config.getOptionalNumber('opsCompass.pollSeconds') ?? 60;
  if (!Number.isInteger(pollSeconds) || pollSeconds < 30 || pollSeconds > 3600)
    throw new Error('Poll interval must be 30–3600 seconds');
  const source = configuredProvider(config);
  const onError = () =>
    logger.warn(
      'Operations observation failed; check source configuration and collection',
    );
  const evidence = createEvidenceService({
    provider: source.provider,
    mode,
    maxAgeSeconds,
    onError,
  });
  const store = new OperationsStore(database, workspaceId);
  const features = new FeatureService(store, config);
  await features.init();
  if (!features.enabled('notifications')) await store.pauseNotifications();
  const connections = new ConnectionService(
    store,
    new ConnectionProbe(config),
    () =>
      logger.warn(
        'Connection test could not be persisted; check private journal storage.',
      ),
    () => features.enabled('connections'),
  );
  await connections.init();
  const integrations = new Integrations(config);
  const workspace = new WorkspaceService(
    store,
    source,
    integrations,
    mode,
    maxAgeSeconds,
    config,
    features.enabled,
  );
  features.setChangeHandler(async (before, after) => {
    if (before.enabled.connections && !after.enabled.connections)
      await connections.cancelActive();
    if (before.enabled.notifications && !after.enabled.notifications)
      await workspace.pauseNotifications();
  });
  const router = express.Router();
  router.use(createFeatureRouter(features, httpAuth, [], actor));
  router.use(createKubernetesRouter(config));
  router.use(createConnectionsRouter(connections, httpAuth, [], actor));
  router.use(createWorkspaceRouter(workspace, httpAuth, [], actor));
  router.use(
    createRouter({
      provider: source.provider,
      mode,
      maxAgeSeconds,
      onError,
      evidence,
    }),
  );
  const poll = () =>
    workspace
      .collect()
      .catch(() =>
        logger.warn(
          'Operations journal collection failed; check private source and storage configuration',
        ),
      );
  const deliver = () =>
    workspace.delivery
      .run()
      .catch(() =>
        logger.warn(
          'Notification worker failed; queued records are retained. Check private storage and configuration.',
        ),
      );
  const timer = setInterval(() => {
    void poll();
  }, pollSeconds * 1000);
  const deliveryTimer = setInterval(() => {
    void deliver();
  }, NotificationWorker.intervalSeconds * 1000);
  return {
    router,
    evidence,
    features,
    async start() {
      await poll();
      await deliver();
    },
    async close() {
      clearInterval(timer);
      clearInterval(deliveryTimer);
      await workspace.settle();
      await connections.close();
      integrations.close();
      source.close?.();
    },
  };
}
