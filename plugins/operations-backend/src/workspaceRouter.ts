import express, { Request, Response } from 'express';
import { HttpAuthService } from '@backstage/backend-plugin-api';
import { z } from 'zod/v3';
import {
  backupInputSchema,
  budgetPreferenceSchema,
  identifierSchema,
  noteInputSchema,
  notificationSettingsSchema,
  worklogInputSchema,
  Workspace,
} from '@ops-compass/operations-common';
import { WorkspaceService, draftWorklog } from './workspace';
import { readInventory } from './inventory';

export function createWorkspaceRouter(
  service: WorkspaceService,
  httpAuth: HttpAuthService,
  writers: string[],
) {
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  async function writer(req: Request): Promise<string | undefined> {
    try {
      const credentials = await httpAuth.credentials(req, { allow: ['user'] });
      const actor = credentials.principal.userEntityRef;
      return writers.includes(actor) ? actor : undefined;
    } catch {
      return undefined;
    }
  }
  const handle =
    (
      action: (req: Request, res: Response, actor?: string) => Promise<void>,
      write = false,
    ) =>
    async (req: Request, res: Response) => {
      const actor = await writer(req);
      if (write && !actor) {
        res.status(403).json({
          error:
            'A configured workspace owner must perform this action. Agent credentials are read-only.',
        });
        return;
      }
      try {
        await action(req, res, actor);
      } catch (error) {
        if (error instanceof z.ZodError)
          res.status(400).json({
            error: 'Invalid input. Check required fields, dates and lengths.',
          });
        else
          res.status(503).json({
            error:
              'The action could not be completed. Check configuration and source availability.',
          });
      }
    };
  const assertService = async (id: string) => {
    const data = await service.source.provider();
    if (!data.services?.some(s => s.id === id))
      throw new Error('Unknown service');
  };
  const selectedEvents = async (ids: number[]) => {
    const events = await service.store.events({ ids });
    if (events.length !== new Set(ids).size)
      throw new Error('Some selected events are unavailable');
    return events.reverse();
  };
  router.get(
    '/inventory',
    handle(async (_req, res) => {
      res.json(await readInventory(service.config));
    }),
  );
  router.get(
    '/workspace',
    handle(async (_req, res, actor) => {
      res.json(await service.read(Boolean(actor)));
    }),
  );
  router.get(
    '/workspace/scenarios',
    handle(async (_req, res) => {
      res.json({
        items: service.source.scenarios ?? [],
        active: service.source.activeScenario?.(),
      });
    }),
  );
  router.post(
    '/workspace/refresh',
    handle(async (_req, res, actor) => {
      await service.collect();
      res.json(await service.read(Boolean(actor)));
    }, true),
  );
  router.post(
    '/workspace/scenario',
    handle(async (req, res, actor) => {
      const { id } = z
        .object({ id: identifierSchema })
        .strict()
        .parse(req.body);
      if (
        !service.isDemo ||
        !service.source.scenarios?.some(s => s.id === id)
      ) {
        res.status(404).json({ error: 'Demo scenario is unavailable' });
        return;
      }
      service.source.selectScenario?.(id);
      await service.store.append({
        kind: 'scenario',
        serviceId: '',
        title: 'Demo scenario selected',
        detail: id,
        actor: actor!,
        source: 'demo',
      });
      await service.collect();
      res.json({ active: id });
    }, true),
  );
  router.get(
    '/events',
    handle(async (req, res) => {
      const query = z
        .object({
          before: z.coerce.number().int().positive().optional(),
          kind: z
            .enum([
              'health',
              'deployment',
              'source',
              'note',
              'backup',
              'worklog',
              'notification',
              'scenario',
            ])
            .optional(),
          serviceId: identifierSchema.optional(),
        })
        .strict()
        .parse(req.query);
      res.json({ items: await service.store.events(query) });
    }),
  );
  router.get(
    '/documents',
    handle(async (_req, res) => {
      res.json({
        items: (await service.store.documents()).filter(document =>
          service.enabled(
            document.kind === 'worklog' ? 'worklogs' : 'maintenance',
          ),
        ),
      });
    }),
  );
  router.get(
    '/documents/:id',
    handle(async (req, res) => {
      const document = await service.store.document(
        z.string().uuid().parse(req.params.id),
      );
      if (
        !document ||
        !service.enabled(
          document.kind === 'worklog' ? 'worklogs' : 'maintenance',
        )
      ) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      res.json(document);
    }),
  );
  router.post(
    '/notes',
    handle(async (req, res, actor) => {
      const input = noteInputSchema.parse(req.body);
      await assertService(input.serviceId);
      res.status(201).json(
        await service.store.saveDocument({
          kind: 'note',
          serviceId: input.serviceId,
          title: 'Maintenance note',
          markdown: input.text,
          actor: actor!,
        }),
      );
    }, true),
  );
  router.post(
    '/backups',
    handle(async (req, res, actor) => {
      const input = backupInputSchema.parse(req.body);
      if (Date.parse(input.verifiedAt) > Date.now()) {
        res.status(400).json({ error: 'Verification cannot be in the future' });
        return;
      }
      await assertService(input.serviceId);
      const record = {
        ...input,
        actor: actor!,
        recordedAt: new Date().toISOString(),
      };
      await service.store.update<Workspace['backups']>('backups', values => [
        record,
        ...(values ?? []).filter(b => b.serviceId !== input.serviceId),
      ]);
      res.status(201).json(
        await service.store.saveDocument({
          kind: 'backup',
          serviceId: input.serviceId,
          title: 'Backup verification recorded',
          actor: actor!,
          markdown: `User-attested verification: ${input.verifiedAt}\nNext check: ${input.dueAt}\n\n${input.evidence}`,
        }),
      );
    }, true),
  );
  router.post(
    '/worklogs/draft',
    handle(async (req, res) => {
      const input = worklogInputSchema.parse(req.body);
      res.json({
        markdown: draftWorklog(
          input.title,
          await selectedEvents(input.eventIds),
        ),
      });
    }, true),
  );
  router.post(
    '/worklogs',
    handle(async (req, res, actor) => {
      const input = worklogInputSchema
        .extend({ markdown: z.string().trim().min(1).max(32000) })
        .strict()
        .parse(req.body);
      const events = await selectedEvents(input.eventIds);
      const provenance = `\n\n---\nRecorded by ${actor}. Selected evidence: ${events
        .map(e => `event ${e.id} (${e.createdAt})`)
        .join(', ')}.\n`;
      res.status(201).json(
        await service.store.saveDocument({
          kind: 'worklog',
          serviceId: '',
          title: input.title,
          markdown: input.markdown + provenance,
          actor: actor!,
        }),
      );
    }, true),
  );
  router.post(
    '/budget-preference',
    handle(async (req, res, actor) => {
      const preference = budgetPreferenceSchema.parse(req.body);
      await service.store.put('budget-preference', preference);
      await service.store.append({
        kind: 'note',
        serviceId: '',
        title: 'Local planning budget updated',
        detail: `${preference.amount} ${preference.currency}; AWS budget configuration was not modified.`,
        actor: actor!,
        source: 'user-recorded',
      });
      res.json(preference);
    }, true),
  );
  router.get(
    '/notifications',
    handle(async (_req, res, actor) => {
      res.json(await service.notifications(Boolean(actor)));
    }),
  );
  router.get(
    '/notifications/progress',
    handle(async (_req, res) => {
      res.json(await service.notificationProgress());
    }),
  );
  router.post(
    '/notifications/settings',
    handle(async (req, res, actor) => {
      await service.saveSettings(
        notificationSettingsSchema.parse(req.body),
        actor!,
      );
      res.json(await service.notifications(true));
    }, true),
  );
  router.post(
    '/notifications/test',
    handle(async (_req, res) => {
      await service.testNotification();
      res.status(202).json(await service.notifications(true));
    }, true),
  );
  router.post(
    '/notifications/:id/cancel',
    handle(async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      await service.store.outbox.cancel(id);
      res.json(await service.notifications(true));
    }, true),
  );
  router.post(
    '/notifications/:id/receipt',
    handle(async (req, res, actor) => {
      const id = z
        .string()
        .regex(/^(event-\d+|[a-f0-9-]{36})$/)
        .parse(req.params.id);
      res.json(await service.store.acknowledge(id, actor!));
    }, true),
  );
  return router;
}
