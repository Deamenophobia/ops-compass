import { z } from 'zod/v3';

export const inventorySnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.enum(['aws-api', 'instance-metadata', 'demo']),
    collectedAt: z.string().datetime({ offset: true }),
    coverage: z
      .array(
        z.object({
          region: z.string().min(1).max(40),
          status: z.enum(['available', 'unavailable']),
          detail: z.string().max(250),
        }),
      )
      .max(50),
    instances: z
      .array(
        z.object({
          instanceId: z.string().regex(/^i-([a-f0-9]{8}|[a-f0-9]{17})$/),
          accountId: z.string().regex(/^\d{12}$/),
          region: z.string().min(1).max(40),
          name: z.string().min(1).max(120),
          instanceType: z.string().max(40),
          state: z.enum([
            'pending',
            'running',
            'stopping',
            'stopped',
            'shutting-down',
            'terminated',
            'unknown',
          ]),
          observedAt: z.string().datetime({ offset: true }),
          serviceIds: z
            .array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/))
            .max(20),
          monitoring: z.enum(['enabled', 'disabled', 'unknown']),
        }),
      )
      .max(500),
  })
  .superRefine((value, ctx) => {
    const keys = value.instances.map(
      i => `${i.accountId}/${i.region}/${i.instanceId}`,
    );
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate instance identity',
      });
  });
export type InventorySnapshot = z.infer<typeof inventorySnapshotSchema>;
export type Inventory = {
  source: InventorySnapshot['source'] | 'none';
  collectedAt?: string;
  evaluatedAt: string;
  freshness: 'current' | 'stale' | 'future' | 'unconfigured';
  coverage: InventorySnapshot['coverage'];
  instances: Array<
    InventorySnapshot['instances'][number] & {
      freshness: 'current' | 'stale' | 'future';
    }
  >;
};

export function evaluateInventory(
  input: unknown,
  maxAgeSeconds: number,
  now = Date.now(),
): Inventory {
  const snapshot = inventorySnapshotSchema.parse(input);
  const freshness = (time: string) => {
    const age = now - Date.parse(time);
    if (age < -60000) return 'future' as const;
    return age > maxAgeSeconds * 1000
      ? ('stale' as const)
      : ('current' as const);
  };
  return {
    ...snapshot,
    evaluatedAt: new Date(now).toISOString(),
    freshness: freshness(snapshot.collectedAt),
    instances: snapshot.instances.map(i => ({
      ...i,
      freshness: freshness(i.observedAt),
    })),
  };
}
