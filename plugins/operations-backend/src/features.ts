import express from 'express';
import { Config } from '@backstage/config';
import { HttpAuthService } from '@backstage/backend-plugin-api';
import { z } from 'zod/v3';
import {
  FeatureId,
  FeatureState,
  featureFlagsSchema,
  featurePreset,
  featureStateSchema,
  workspaceFeatures,
} from '@ops-compass/operations-common';
import { OperationsStore } from './store';

const key = 'features-v1';
class FeatureConflict extends Error {}

/** Workspace choices are durable. They grant no credentials or provider permissions. */
export class FeatureService {
  private current: FeatureState;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly store: OperationsStore,
    config: Config,
    private changed: (
      before: FeatureState,
      after: FeatureState,
    ) => Promise<void> = async () => {},
  ) {
    this.current = {
      version: 0,
      enabled: {
        ...featurePreset(config.getString('opsCompass.mode') === 'demo'),
        ...featureFlagsSchema
          .partial()
          .parse(config.getOptional('opsCompass.features.defaults') ?? {}),
      },
    };
  }
  async init() {
    const saved = await this.store.get(key);
    if (saved) this.current = featureStateSchema.parse(saved);
  }
  setChangeHandler(handler: FeatureService['changed']) {
    this.changed = handler;
  }
  enabled = (id: FeatureId) => this.current.enabled[id];
  any = (ids: readonly FeatureId[]) => ids.some(this.enabled);
  read() {
    return { ...this.current, enabled: { ...this.current.enabled } };
  }
  save(input: Pick<FeatureState, 'version' | 'enabled'>, actor: string) {
    const work = this.pending.then(async () => {
      const before = this.read();
      if (input.version !== before.version) throw new FeatureConflict();
      const after = featureStateSchema.parse({
        version: before.version + 1,
        enabled: input.enabled,
        updatedBy: actor,
        updatedAt: new Date().toISOString(),
      });
      await this.store.put(key, after);
      // Close admission before draining/cancelling work. A request already sent to
      // an external provider may finish; disabling cannot recall such a request.
      this.current = after;
      await this.changed(before, after);
      return this.read();
    });
    this.pending = work.catch(() => undefined);
    return work;
  }
}

export function createFeatureRouter(
  features: FeatureService,
  auth: HttpAuthService,
  writers: string[],
) {
  const router = express.Router();
  router.use(express.json({ limit: '16kb' }));
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const actor = async (req: express.Request) => {
    try {
      const credentials = await auth.credentials(req, { allow: ['user'] });
      const user = credentials.principal.userEntityRef;
      return writers.includes(user) ? user : undefined;
    } catch {
      return undefined;
    }
  };
  router.get('/features', async (req, res) => {
    res.json({ ...features.read(), canWrite: Boolean(await actor(req)) });
  });
  router.post('/features', async (req, res) => {
    const user = await actor(req);
    if (!user) {
      res.status(403).json({
        error: 'Only a configured workspace owner can change features.',
      });
      return;
    }
    try {
      const input = z
        .object({
          version: z.number().int().nonnegative(),
          enabled: featureFlagsSchema,
        })
        .strict()
        .parse(req.body);
      res.json({ ...(await features.save(input, user)), canWrite: true });
    } catch (error) {
      if (error instanceof FeatureConflict)
        res
          .status(409)
          .json({ error: 'Feature settings changed. Reload before saving.' });
      else if (error instanceof z.ZodError)
        res.status(400).json({ error: 'Invalid feature settings.' });
      else
        res.status(503).json({
          error:
            'Feature settings could not finish updating. Reload to check the saved state.',
        });
    }
  });
  // Server admission is independent of navigation; direct URLs and agent tokens
  // cannot bypass disabled modules. Core overview and feature settings stay available.
  router.use((req, res, next) => {
    const root = req.path.split('/')[1];
    const requirements: Record<string, readonly FeatureId[]> = {
      inventory: ['inventory'],
      connections: ['connections'],
      agent: ['agent'],
      notifications: ['notifications'],
      'budget-preference': ['costs'],
      worklogs: ['worklogs'],
      notes: ['maintenance'],
      backups: ['maintenance'],
      documents: ['maintenance', 'worklogs'],
      events: ['history', 'worklogs'],
      workspace: workspaceFeatures,
    };
    if (requirements[root] && !features.any(requirements[root])) {
      res.status(403).json({
        error: 'This feature is disabled. Enable it in Workspace features.',
        code: 'FEATURE_DISABLED',
      });
      return;
    }
    next();
  });
  return router;
}
