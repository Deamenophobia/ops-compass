import express from 'express';
import {
  ConflictError,
  InputError,
  NotAllowedError,
  NotFoundError,
} from '@backstage/errors';
import { z } from 'zod/v3';
import {
  DEFAULT_WORKSPACE_ID,
  memberRefSchema,
  workspaceIdSchema,
  workspaceNameSchema,
  workspaceRoleSchema,
} from '@ops-compass/core';
import { WorkspaceAccess } from './access';
import { WorkspaceDirectory } from './store';

export function createWorkspaceDirectoryRouter(
  directory: WorkspaceDirectory,
  access: WorkspaceAccess,
) {
  const router = express.Router();
  router.use('/workspaces', express.json({ limit: '16kb' }));
  const handle =
    (action: (req: express.Request, res: express.Response) => Promise<void>) =>
    async (req: express.Request, res: express.Response) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        await action(req, res);
      } catch (error) {
        let status = 503;
        if (error instanceof z.ZodError || error instanceof InputError)
          status = 400;
        else if (error instanceof NotAllowedError) status = 403;
        else if (error instanceof NotFoundError) status = 404;
        else if (error instanceof ConflictError) status = 409;
        let message = 'Workspace service unavailable.';
        if (error instanceof z.ZodError) message = 'Invalid workspace request.';
        else if (status !== 503) message = (error as Error).message;
        res.status(status).json({ error: message });
      }
    };
  router.get(
    '/workspaces',
    handle(async (req, res) => {
      const credentials = await access.credentials(req);
      if (credentials.principal.type !== 'user')
        throw new NotAllowedError('A user identity is required.');
      const userEntityRef = credentials.principal.userEntityRef;
      const items = [];
      for (const workspace of await directory.list()) {
        if (
          access.profile === 'personal' &&
          workspace.id !== DEFAULT_WORKSPACE_ID
        )
          continue;
        if (await access.allowed(credentials, workspace.id, 'read')) {
          const resource = (await directory.get(workspace.id))!;
          const role = resource.members.find(
            m => m.userEntityRef === userEntityRef,
          )?.role;
          if (role) items.push({ ...workspace, role });
        }
      }
      res.json({
        profile: access.profile,
        userEntityRef,
        canCreate: await access.canCreate(credentials),
        items,
      });
    }),
  );
  router.post(
    '/workspaces',
    handle(async (req, res) => {
      const credentials = await access.credentials(req);
      if (
        credentials.principal.type !== 'user' ||
        !(await access.canCreate(credentials))
      )
        throw new NotAllowedError(
          'Workspace creation requires team mode and an authorized user.',
        );
      const { name } = z
        .object({ name: workspaceNameSchema })
        .strict()
        .parse(req.body);
      res
        .status(201)
        .json(
          await directory.create(name, credentials.principal.userEntityRef),
        );
    }),
  );
  const admin = async (req: express.Request) => {
    const id = workspaceIdSchema.parse(req.params.id);
    if (access.profile === 'personal' && id !== DEFAULT_WORKSPACE_ID)
      throw new NotAllowedError(
        'Switch the installation to team mode to access additional workspaces.',
      );
    await access.require(await access.credentials(req), id, 'admin');
    return id;
  };
  router.get(
    '/workspaces/:id',
    handle(async (req, res) => {
      res.json(await directory.get(await admin(req)));
    }),
  );
  router.post(
    '/workspaces/:id',
    handle(async (req, res) => {
      const id = await admin(req);
      const { version, name } = z
        .object({
          version: z.number().int().nonnegative(),
          name: workspaceNameSchema,
        })
        .strict()
        .parse(req.body);
      await directory.rename(id, version, name);
      res.json(await directory.get(id));
    }),
  );
  router.post(
    '/workspaces/:id/members',
    handle(async (req, res) => {
      const id = await admin(req);
      if (access.profile !== 'team')
        throw new NotAllowedError('Member management requires team mode.');
      const { version, userEntityRef, role } = z
        .object({
          version: z.number().int().nonnegative(),
          userEntityRef: memberRefSchema,
          role: workspaceRoleSchema.nullable(),
        })
        .strict()
        .parse(req.body);
      await directory.setMember(id, version, userEntityRef, role);
      res.json(await directory.get(id));
    }),
  );
  return router;
}
