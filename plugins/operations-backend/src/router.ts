import express from 'express';
import {
  agentRequestSchema,
  Overview,
  runbookIdSchema,
} from '@ops-compass/operations-common';
import { SnapshotProvider } from './providers';
import {
  createEvidenceService,
  EvidenceService,
  ObservationNotFoundError,
  runbooks,
  sourceUnavailable,
} from './agent';

export function createRouter(options: {
  provider: SnapshotProvider;
  mode: Overview['mode'];
  maxAgeSeconds: number;
  onError: () => void;
  evidence?: EvidenceService;
}) {
  // Authentication is provided by Backstage's plugin router in index.ts.
  // Do not mount this Express router directly on an unauthenticated server.
  const router = express.Router();
  const evidence = options.evidence ?? createEvidenceService(options);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get('/overview', async (_req, res) => {
    try {
      res.json(await evidence.overview());
    } catch {
      res.status(503).json({ error: sourceUnavailable });
    }
  });
  router.get('/agent/runbooks/:id', (req, res) => {
    const id = runbookIdSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(404).json({ error: 'Runbook not found' });
      return;
    }
    res.json({ runbook: runbooks.find(r => r.id === id.data) });
  });
  router.get('/agent/context', async (req, res) => {
    const input = agentRequestSchema.safeParse(req.query);
    if (!input.success) {
      res.status(400).json({
        error: 'Use intent=incident or worklog and an optional observationId.',
      });
      return;
    }
    try {
      res.json(await evidence.context(input.data));
    } catch (error) {
      if (error instanceof ObservationNotFoundError) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(503).json({ error: sourceUnavailable });
      }
    }
  });
  return router;
}
