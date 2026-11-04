import { z } from 'zod/v3';

const name = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/);
const count = z.number().int().nonnegative().max(1000000);
const coverage = z.enum([
  'available',
  'unauthorized',
  'tls-error',
  'forbidden',
  'unavailable',
  'invalid',
  'limit',
]);
export const kubernetesSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.enum(['kubernetes-api', 'demo']),
    collectedAt: z.string().datetime({ offset: true }),
    targets: z
      .array(
        z.object({
          cluster: name,
          namespace: name,
          entityRef: z
            .string()
            .regex(/^component:[a-z0-9_-]+\/[a-z0-9_.-]+$/)
            .max(200),
          selector: z.string().min(1).max(250),
          dashboardUrl: z
            .string()
            .url()
            .refine(value => {
              try {
                const url = new URL(value);
                return (
                  url.protocol === 'https:' && !url.username && !url.password
                );
              } catch {
                return false;
              }
            })
            .optional(),
          coverage: z.object({
            deployments: coverage,
            pods: coverage,
            events: coverage,
          }),
          deployments: z
            .array(
              z.object({
                name,
                desired: count,
                ready: count,
                available: count,
                updated: count,
                generation: count,
                observedGeneration: count.nullable(),
                paused: z.boolean(),
                failed: z.boolean(),
              }),
            )
            .max(100),
          pods: z
            .array(
              z.object({
                name,
                phase: z.enum([
                  'Pending',
                  'Running',
                  'Succeeded',
                  'Failed',
                  'Unknown',
                ]),
                ready: z.boolean().nullable(),
                restarts: count.nullable(),
                terminating: z.boolean(),
              }),
            )
            .max(100),
          warnings: z
            .array(
              z.object({
                object: z.string().min(1).max(280),
                reason: z.string().max(100),
                count,
                lastSeen: z.string().datetime({ offset: true }).nullable(),
              }),
            )
            .max(100),
        }),
      )
      .max(20),
  })
  .superRefine((value, ctx) => {
    const keys = value.targets.map(
      t => `${t.cluster}/${t.namespace}/${t.entityRef}`,
    );
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate target' });
    for (const target of value.targets) {
      for (const field of ['deployments', 'pods'] as const) {
        if (
          new Set(target[field].map(item => item.name)).size !==
          target[field].length
        )
          ctx.addIssue({ code: 'custom', message: 'Duplicate resource' });
        if (target.coverage[field] !== 'available' && target[field].length)
          ctx.addIssue({
            code: 'custom',
            message: 'Unavailable resource data',
          });
      }
      if (target.coverage.events !== 'available' && target.warnings.length)
        ctx.addIssue({ code: 'custom', message: 'Unavailable events' });
    }
  });
export type KubernetesSnapshot = z.infer<typeof kubernetesSnapshotSchema>;
type Target = KubernetesSnapshot['targets'][number];
function deploymentStatus(item: Target['deployments'][number], fresh: boolean) {
  if (!fresh || item.observedGeneration === null) return 'unknown';
  if (item.paused) return 'paused';
  if (item.observedGeneration < item.generation) return 'progressing';
  if (item.failed) return 'degraded';
  if (item.desired === 0) return 'scaled-down';
  if (
    item.ready >= item.desired &&
    item.available >= item.desired &&
    item.updated === item.desired
  )
    return 'ready';
  return 'progressing';
}
function podStatus(item: Target['pods'][number], fresh: boolean) {
  if (!fresh) return 'unknown';
  if (item.terminating) return 'terminating';
  if (item.phase === 'Succeeded') return 'completed';
  if (item.phase === 'Failed') return 'failed';
  if (item.phase === 'Running' && item.ready === true) return 'ready';
  if (item.phase === 'Pending' || item.ready === false) return 'not-ready';
  return 'unknown';
}
export function evaluateKubernetes(
  snapshot: KubernetesSnapshot,
  maxAgeSeconds: number,
  now = Date.now(),
) {
  const age = now - Date.parse(snapshot.collectedAt);
  const fresh = age >= -30000 && age <= maxAgeSeconds * 1000;
  return {
    ...snapshot,
    evaluatedAt: new Date(now).toISOString(),
    expiresAt: new Date(
      Date.parse(snapshot.collectedAt) + maxAgeSeconds * 1000,
    ).toISOString(),
    freshness: fresh ? ('fresh' as const) : ('stale' as const),
    targets: snapshot.targets.map(target => ({
      ...target,
      deployments: target.deployments.map(item => ({
        ...item,
        status: deploymentStatus(item, fresh),
      })),
      pods: target.pods.map(item => ({
        ...item,
        status: podStatus(item, fresh),
      })),
    })),
  };
}
export type KubernetesView = ReturnType<typeof evaluateKubernetes>;
