import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { JsonObject } from '@backstage/types';
import { ConfigReader } from '@backstage/config';
import { NotAllowedError } from '@backstage/errors';
import {
  DEFAULT_WORKSPACE_ID,
  WORKSPACE_HEADER,
  profileSchema,
  workspaceIdSchema,
} from '@ops-compass/core';
import {
  WorkspaceAccess,
  WorkspaceDirectory,
  createWorkspaceDirectoryRouter,
  registerWorkspacePermissions,
} from '@ops-compass/core-node';
import { OperationsStore } from './store';
import { createOperationsRuntime } from './runtime';
import { registerAgentActions } from './actions';

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
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
        auth: coreServices.auth,
      },
      async init({
        config,
        httpRouter,
        logger,
        lifecycle,
        actionsRegistry,
        database,
        httpAuth,
        permissions,
        permissionsRegistry,
        auth,
      }) {
        if (config.getOptionalBoolean('permission.enabled') !== true)
          throw new Error('Workspace access requires permission.enabled: true');
        const profile = profileSchema.parse(
          config.getOptionalString('opsCompass.profile') ?? 'personal',
        );
        const db = await database.getClient();
        await new OperationsStore(db).init();
        const directory = new WorkspaceDirectory(db);
        await directory.init(
          config.getOptionalStringArray('opsCompass.writers') ?? [
            'user:default/guest',
          ],
        );
        registerWorkspacePermissions(permissionsRegistry, directory);
        const access = new WorkspaceAccess(
          profile,
          httpAuth,
          permissions,
          auth,
        );
        httpRouter.use(createWorkspaceDirectoryRouter(directory, access));
        const sources =
          config.getOptionalConfigArray('opsCompass.workspaceSources') ?? [];
        const sourceIds = sources.map(source =>
          workspaceIdSchema.parse(source.getString('workspaceId')),
        );
        if (
          sourceIds.includes(DEFAULT_WORKSPACE_ID) ||
          new Set(sourceIds).size !== sourceIds.length
        )
          throw new Error(
            'Workspace sources require unique non-personal workspace IDs',
          );
        const runtimes = new Map<
          string,
          ReturnType<typeof createOperationsRuntime>
        >();
        const runtimeFor = (workspaceId: string) => {
          let runtime = runtimes.get(workspaceId);
          if (!runtime) {
            const source = sources.find(
              item => item.getString('workspaceId') === workspaceId,
            );
            // A new workspace cannot inherit the owner's credentials, file paths or integrations.
            const scopedConfig =
              workspaceId === DEFAULT_WORKSPACE_ID
                ? config
                : new ConfigReader({
                    opsCompass: {
                      mode: 'unconfigured',
                      ...(source?.getConfig('settings').get<JsonObject>() ??
                        {}),
                    },
                  });
            runtime = createOperationsRuntime({
              workspaceId,
              database: db,
              config: scopedConfig,
              httpAuth,
              logger,
              actor: access.actor(workspaceId),
            });
            runtimes.set(workspaceId, runtime);
            void runtime.catch(() => runtimes.delete(workspaceId));
          }
          return runtime;
        };
        const personal = await runtimeFor(DEFAULT_WORKSPACE_ID);
        registerAgentActions(
          actionsRegistry,
          personal.evidence,
          () => personal.features.enabled('agent'),
          async (workspaceId, credentials) => {
            if (profile === 'personal' && workspaceId !== DEFAULT_WORKSPACE_ID)
              throw new NotAllowedError('Workspace unavailable');
            await access.require(credentials, workspaceId, 'read');
            if (!(await directory.get(workspaceId)))
              throw new NotAllowedError('Workspace unavailable');
            const runtime = await runtimeFor(workspaceId);
            return {
              evidence: runtime.evidence,
              enabled: runtime.features.enabled('agent'),
            };
          },
        );
        httpRouter.use(async (req, res, next) => {
          res.setHeader('Cache-Control', 'no-store');
          const selected = workspaceIdSchema.safeParse(
            req.header(WORKSPACE_HEADER) ?? DEFAULT_WORKSPACE_ID,
          );
          if (!selected.success) {
            res.status(400).json({ error: 'Invalid workspace ID' });
            return;
          }
          try {
            if (
              profile === 'personal' &&
              selected.data !== DEFAULT_WORKSPACE_ID
            )
              throw new NotAllowedError('Workspace unavailable');
            await access.require(
              await access.credentials(req),
              selected.data,
              'read',
            );
            if (!(await directory.get(selected.data)))
              throw new NotAllowedError('Workspace unavailable');
            const runtime = await runtimeFor(selected.data);
            runtime.router(req, res, next);
          } catch (error) {
            res
              .status(error instanceof NotAllowedError ? 403 : 503)
              .json({ error: 'Workspace unavailable or access denied' });
          }
        });
        lifecycle.addStartupHook(async () => {
          for (const workspace of await directory.list()) {
            if (profile === 'personal' && workspace.id !== DEFAULT_WORKSPACE_ID)
              continue;
            await (await runtimeFor(workspace.id)).start();
          }
        });
        lifecycle.addShutdownHook(async () => {
          await Promise.all(
            [...runtimes.values()].map(async runtime =>
              (await runtime).close(),
            ),
          );
        });
        logger.info(`Operations enabled with ${profile} workspace permissions`);
      },
    });
  },
});
