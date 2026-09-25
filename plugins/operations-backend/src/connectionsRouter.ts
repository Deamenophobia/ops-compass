import express, { Request, Response } from 'express';
import { HttpAuthService } from '@backstage/backend-plugin-api';
import { z } from 'zod/v3';
import {
  savedConnectionInputSchema,
  connectionTestInputSchema,
} from '@ops-compass/operations-common';
import { ConnectionService, ConnectionError } from './connections';

export function createConnectionsRouter(
  service: ConnectionService,
  httpAuth: HttpAuthService,
  writers: string[],
) {
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));
  const handle =
    (
      action: (req: Request, res: Response, actor?: string) => Promise<void>,
      write = false,
    ) =>
    async (req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store');
      let actor: string | undefined;
      try {
        const credentials = await httpAuth.credentials(req, {
          allow: ['user'],
        });
        if (writers.includes(credentials.principal.userEntityRef))
          actor = credentials.principal.userEntityRef;
      } catch {
        /* Backstage's outer router authenticates readers; agents cannot write or test. */
      }
      if (write && !actor) {
        res.status(403).json({
          error:
            'A configured workspace owner must manage or test connections. Agent credentials are read-only.',
        });
        return;
      }
      try {
        await action(req, res, actor);
      } catch (error) {
        let status = 503;
        let message =
          'Connection storage or testing is unavailable. No access has been verified.';
        if (error instanceof ConnectionError) {
          status = error.status;
          message = error.message;
        } else if (error instanceof z.ZodError) {
          status = 400;
          message =
            'Invalid connection data. Check required fields and targets.';
        }
        res.status(status).json({ error: message });
      }
    };
  router.get(
    '/connections',
    handle(async (_req, res, actor) => {
      res.json({
        items: await service.list(),
        canWrite: Boolean(actor),
        testMode: service.probe.mode,
      });
    }),
  );
  router.post(
    '/connections',
    handle(async (req, res, actor) => {
      res
        .status(201)
        .json(
          await service.save(
            savedConnectionInputSchema.parse(req.body),
            actor!,
          ),
        );
    }, true),
  );
  router.post(
    '/connections/:id',
    handle(async (req, res, actor) => {
      const id = z.string().uuid().parse(req.params.id);
      const { version, ...input } = savedConnectionInputSchema
        .extend({ version: z.number().int().positive() })
        .strict()
        .parse(req.body);
      res.json(await service.save(input, actor!, id, version));
    }, true),
  );
  router.post(
    '/connections/:id/test',
    handle(async (req, res, actor) => {
      const id = z.string().uuid().parse(req.params.id);
      res
        .status(202)
        .json(
          await service.test(
            id,
            connectionTestInputSchema.parse(req.body),
            actor!,
          ),
        );
    }, true),
  );
  return router;
}
