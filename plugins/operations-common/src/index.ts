import { z } from 'zod/v3';
import { serviceSchema, deploymentSchema, budgetSchema } from './workspace';

export * from './workspace';
export * from './inventory';
export * from './connections';
export * from './savedConnections';
export * from './features';

export const stateSchema = z.enum([
  'healthy',
  'warning',
  'critical',
  'unknown',
]);
export const observationSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
  entityRef: z
    .string()
    .regex(/^(component|resource|system):[a-z0-9-]+\/[a-z0-9-]+$/),
  label: z.string().min(1).max(120),
  environment: z.string().min(1).max(40),
  region: z.string().min(1).max(40),
  state: stateSchema,
  observedAt: z.string().datetime({ offset: true }),
  stateChangedAt: z.string().datetime({ offset: true }).optional(),
  summary: z.string().min(1).max(1000),
  maxAgeSeconds: z.number().int().min(1).max(86400).optional(),
});

export const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.enum(['none', 'demo', 'ssh', 'cloudwatch']),
    observations: z.array(observationSchema).max(200),
    services: z.array(serviceSchema).max(100).optional(),
    deployments: z.array(deploymentSchema).max(100).optional(),
    budget: budgetSchema.optional(),
  })
  .superRefine((snapshot, ctx) => {
    if (
      snapshot.source === 'none' &&
      (snapshot.observations.length ||
        snapshot.services?.length ||
        snapshot.deployments?.length ||
        snapshot.budget)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An unconfigured source cannot contain observations',
      });
    }
    const services = snapshot.services ?? [];
    if (new Set(services.map(s => s.id)).size !== services.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Service IDs must be unique',
      });
    }
    const ids = snapshot.observations.map(o => o.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Observation IDs must be unique',
      });
    }
  });

export const evaluatedObservationSchema = observationSchema.extend({
  reportedState: stateSchema,
  freshness: z.enum(['current', 'stale', 'future']),
});

export const overviewSchema = z.object({
  mode: z.enum(['unconfigured', 'demo', 'snapshot', 'cloudwatch']),
  source: z.enum(['none', 'demo', 'ssh', 'cloudwatch']),
  evaluatedAt: z.string().datetime({ offset: true }),
  maxAgeSeconds: z.number().positive(),
  overall: stateSchema,
  counts: z.object({
    healthy: z.number(),
    warning: z.number(),
    critical: z.number(),
    unknown: z.number(),
  }),
  observations: z.array(evaluatedObservationSchema),
});

export type Observation = z.infer<typeof observationSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Overview = z.infer<typeof overviewSchema>;
export type State = Observation['state'];

export const agentRequestSchema = z
  .object({
    intent: z.enum(['incident', 'worklog']),
    observationId: observationSchema.shape.id.optional(),
  })
  .strict();

export const runbookIdSchema = z.enum(['health', 'email-alerts']);
export const citationSchema = z.object({
  id: z.string(),
  title: z.string(),
  href: z.string(),
  source: z.string(),
});
export const runbookSchema = z.object({
  id: runbookIdSchema,
  title: z.string(),
  status: z.string(),
  steps: z.array(z.string()),
  citation: citationSchema,
});
export const agentContextSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('evidence-context'),
  intent: agentRequestSchema.shape.intent,
  overview: overviewSchema,
  citations: z.array(citationSchema),
  runbooks: z.array(runbookSchema),
  guidance: z.array(z.string()),
  draftOutline: z.array(z.string()),
});
export type AgentRequest = z.infer<typeof agentRequestSchema>;
export type AgentContext = z.infer<typeof agentContextSchema>;
export type Runbook = z.infer<typeof runbookSchema>;

function containerState(
  container: z.infer<typeof serviceSchema>['containers'][number],
): State {
  if (container.state === 'stopped' || container.health === 'failing')
    return 'critical';
  if (container.state === 'running' && container.health === 'passing')
    return 'healthy';
  if (container.health === 'starting') return 'warning';
  return 'unknown';
}

function certificateState(remaining: number | undefined): State {
  if (remaining === undefined) return 'unknown';
  if (remaining <= 0) return 'critical';
  if (remaining < 14 * 86400000) return 'warning';
  return 'healthy';
}

/**
 * The single health evaluator used by HTTP, MCP and the dashboard.
 * Keep the reported state for provenance, but never reuse it as current health
 * after expiry. The one-minute future tolerance allows small host clock drift.
 */
export function evaluateSnapshot(
  input: unknown,
  mode: Overview['mode'],
  maxAgeSeconds: number,
  now = new Date(),
): Overview {
  if (
    !Number.isFinite(maxAgeSeconds) ||
    maxAgeSeconds < 1 ||
    maxAgeSeconds > 86400
  ) {
    throw new Error('maxAgeSeconds must be between 1 and 86400');
  }
  const snapshot = snapshotSchema.parse(input);
  const serviceChecks: Observation[] = (snapshot.services ?? []).flatMap(
    service => {
      const base = {
        entityRef: service.entityRef,
        environment: service.environment,
        region: service.region ?? 'unspecified',
      };
      const checks: Observation[] = service.containers.map(
        (container, index) => ({
          ...base,
          id: `${service.id}-container-${index}`,
          label: `${service.name} / ${container.name}`.slice(0, 120),
          observedAt: container.observedAt,
          state: containerState(container),
          summary: `Process: ${container.state}; health check: ${container.health}. Process state alone does not prove application readiness.`,
        }),
      );
      if (service.heartbeat)
        checks.push({
          ...base,
          id: `${service.id}-heartbeat`,
          label: `${service.name} / heartbeat`.slice(0, 120),
          observedAt: service.heartbeat.lastSeenAt ?? service.observedAt,
          state: service.heartbeat.lastSeenAt ? 'healthy' : 'unknown',
          maxAgeSeconds: service.heartbeat.maxAgeSeconds,
          summary: service.heartbeat.lastSeenAt
            ? 'Worker heartbeat timestamp. This is separate from container process state.'
            : 'No heartbeat timestamp was returned.',
        });
      if (service.certificate) {
        const remaining = service.certificate.expiresAt
          ? Date.parse(service.certificate.expiresAt) - now.getTime()
          : undefined;
        checks.push({
          ...base,
          id: `${service.id}-certificate`,
          label: `${service.name} / TLS certificate`.slice(0, 120),
          observedAt: service.certificate.checkedAt,
          state: certificateState(remaining),
          summary: service.certificate.expiresAt
            ? `Certificate expires ${service.certificate.expiresAt}.`
            : 'TLS certificate check did not return a verified expiry.',
        });
      }
      return checks;
    },
  );
  const combined = [...snapshot.observations, ...serviceChecks];
  if (new Set(combined.map(o => o.id)).size !== combined.length)
    throw new Error('Observation IDs collide with service checks');
  const observations = combined.map(observation => {
    const age = now.getTime() - Date.parse(observation.observedAt);
    let freshness: 'current' | 'stale' | 'future' = 'current';
    if (age < -60_000) freshness = 'future';
    else if (
      age >
      Math.min(maxAgeSeconds, observation.maxAgeSeconds ?? maxAgeSeconds) * 1000
    )
      freshness = 'stale';
    return {
      ...observation,
      reportedState: observation.state,
      state: freshness === 'current' ? observation.state : ('unknown' as const),
      freshness,
    };
  });
  const counts = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
  observations.forEach(o => counts[o.state]++);
  let overall: State = 'healthy';
  // Missing evidence must not hide a known critical check, or imply that an
  // empty collection is healthy. This order is intentional.
  if (counts.critical) overall = 'critical';
  else if (counts.warning) overall = 'warning';
  else if (counts.unknown || !observations.length) overall = 'unknown';
  return {
    mode,
    source: snapshot.source,
    evaluatedAt: now.toISOString(),
    maxAgeSeconds,
    overall,
    counts,
    observations,
  };
}
