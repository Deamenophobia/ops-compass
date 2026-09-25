import { z } from 'zod/v3';
import { connectionDraftSchema } from './connections';

export const savedConnectionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    environment: z.string().trim().min(1).max(40),
    enabled: z.boolean(),
    draft: connectionDraftSchema,
  })
  .strict();
export const connectionCheckSchema = z.object({
  target: z.string().max(120),
  status: z.enum(['passed', 'failed', 'blocked']),
  detail: z.string().max(500),
});
export const connectionTestSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  source: z.enum(['live', 'simulated']),
  status: z.enum(['running', 'passed', 'failed', 'blocked', 'interrupted']),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  actor: z.string(),
  checks: z.array(connectionCheckSchema).max(21),
});
export const savedConnectionSchema = savedConnectionInputSchema.extend({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
  lastTest: connectionTestSchema.optional(),
});
export const connectionListSchema = z.object({
  items: z.array(savedConnectionSchema).max(25),
  canWrite: z.boolean(),
  testMode: z.enum(['disabled', 'live', 'simulated']),
});
export const connectionTestInputSchema = z
  .object({
    version: z.number().int().positive(),
    scenario: z.enum(['success', 'denied', 'unreachable']).optional(),
  })
  .strict();
export type SavedConnectionInput = z.infer<typeof savedConnectionInputSchema>;
export type SavedConnection = z.infer<typeof savedConnectionSchema>;
export type ConnectionTest = z.infer<typeof connectionTestSchema>;
export type ConnectionCheck = z.infer<typeof connectionCheckSchema>;
export type ConnectionList = z.infer<typeof connectionListSchema>;
export type ConnectionTestInput = z.infer<typeof connectionTestInputSchema>;
