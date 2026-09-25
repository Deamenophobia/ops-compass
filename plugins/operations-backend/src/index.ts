import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { configuredProvider } from './providers';
import { createRouter } from './router';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { createEvidenceService } from './agent';
import { registerAgentActions } from './actions';
import { OperationsStore } from './store';
import { Integrations } from './integrations';
import { WorkspaceService } from './workspace';
import { createWorkspaceRouter } from './workspaceRouter';
import { NotificationWorker } from './notificationWorker';
import { ConnectionService } from './connections';
import { ConnectionProbe } from './connectionProbe';
import { createConnectionsRouter } from './connectionsRouter';
import { FeatureService, createFeatureRouter } from './features';

export default createBackendPlugin({
  pluginId: 'operations',
  register(env) {
    env.registerInit({
      deps: {
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        lifecycle: coreServices.lifecycle,
        actionsRegistry: actionsRegistryServiceRef,
        database: coreServices.database,
        httpAuth: coreServices.httpAuth,
      },
      async init({
        config,
        httpRouter,
        logger,
        lifecycle,
        actionsRegistry,
        database,
        httpAuth,
      }) {
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
        const source = configuredProvider(config);
        const { provider, close } = source;
        const onError = () =>
          logger.warn(
            'Operations observation failed; check source configuration and collection',
          );
        const evidence = createEvidenceService({
          provider,
          mode,
          maxAgeSeconds,
          onError,
        });
        const store = new OperationsStore(await database.getClient());
        await store.init();
        const features = new FeatureService(store, config);
        await features.init();
        if (!features.enabled('notifications'))
          await store.pauseNotifications();
        const writers = config.getOptionalStringArray('opsCompass.writers') ?? [
          'user:default/guest',
        ];
        httpRouter.use(createFeatureRouter(features, httpAuth, writers));
        registerAgentActions(actionsRegistry, evidence, () =>
          features.enabled('agent'),
        );
        const connections: ConnectionService = new ConnectionService(
          store,
          new ConnectionProbe(config),
          () =>
            logger.warn(
              'Connection test could not be persisted; check private journal storage.',
            ),
          () => features.enabled('connections'),
        );
        await connections.init();
        httpRouter.use(
          createConnectionsRouter(
            connections,
            httpAuth,
            config.getOptionalStringArray('opsCompass.writers') ?? [
              'user:default/guest',
            ],
          ),
        );
        const integrations = new Integrations(config);
        const workspace: WorkspaceService = new WorkspaceService(
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
        httpRouter.use(
          createWorkspaceRouter(
            workspace,
            httpAuth,
            config.getOptionalStringArray('opsCompass.writers') ?? [
              'user:default/guest',
            ],
          ),
        );
        const pollSeconds =
          config.getOptionalNumber('opsCompass.pollSeconds') ?? 60;
        if (
          !Number.isInteger(pollSeconds) ||
          pollSeconds < 30 ||
          pollSeconds > 3600
        )
          throw new Error('Poll interval must be 30–3600 seconds');
        const poll = () =>
          workspace
            .collect()
            .catch(() =>
              logger.warn(
                'Operations journal collection failed; check private source and storage configuration',
              ),
            );
        const timer = setInterval(() => {
          void poll();
        }, pollSeconds * 1000);
        const deliver = () =>
          workspace.delivery
            .run()
            .catch(() =>
              logger.warn(
                'Notification worker failed; queued records are retained. Check private storage and configuration.',
              ),
            );
        const deliveryTimer = setInterval(() => {
          void deliver();
        }, NotificationWorker.intervalSeconds * 1000);
        lifecycle.addShutdownHook(async () => {
          clearInterval(timer);
          clearInterval(deliveryTimer);
          await workspace.settle();
          await connections.close();
          integrations.close();
          close?.();
        });
        lifecycle.addStartupHook(async () => {
          await poll();
          await deliver();
        });
        // The Backstage HTTP router requires credentials by default. No unauthenticated policy is added.
        httpRouter.use(
          createRouter({
            provider,
            mode,
            maxAgeSeconds,
            onError,
            evidence,
          }),
        );
        logger.info(
          `Operations enabled in ${mode} mode; infrastructure access is read only, journal writes require an owner`,
        );
      },
    });
  },
});
