import { z } from 'zod/v3';

export const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const timestamp = z.string().datetime({ offset: true });
export const containerSchema = z.object({
  name: z.string().min(1).max(120),
  image: z.string().max(300),
  imageId: z.string().max(100).optional(),
  revision: z.string().max(64).optional(),
  state: z.enum(['running', 'stopped', 'unknown']),
  health: z.enum([
    'passing',
    'failing',
    'starting',
    'not-configured',
    'unknown',
  ]),
  restartCount: z.number().int().nonnegative().nullable(),
  startedAt: timestamp.optional(),
  observedAt: timestamp,
});
export const serviceSchema = z.object({
  id: identifierSchema.max(40),
  name: z.string().min(1).max(120),
  entityRef: z.string().regex(/^component:[a-z0-9-]+\/[a-z0-9-]+$/),
  host: z.string().min(1).max(120),
  region: z.string().max(40).optional(),
  environment: z.string().max(40),
  observedAt: timestamp,
  containers: z.array(containerSchema).max(50),
  heartbeat: z
    .object({
      lastSeenAt: timestamp.optional(),
      maxAgeSeconds: z.number().int().positive().max(86400),
    })
    .optional(),
  certificate: z
    .object({
      hostname: z.string().max(253),
      checkedAt: timestamp,
      expiresAt: timestamp.optional(),
    })
    .optional(),
});
export const deploymentSchema = z.object({
  serviceId: identifierSchema,
  project: z.string().max(200),
  ref: z.string().max(200),
  sha: z.string().regex(/^[a-f0-9]{7,64}$/),
  status: z.string().max(40),
  webUrl: z
    .string()
    .url()
    .refine(s => s.startsWith('https://')),
  updatedAt: timestamp,
  observedAt: timestamp,
});
export const budgetSchema = z.object({
  name: z.string().max(120),
  currency: z.string().regex(/^[A-Z]{3}$/),
  limit: z.number().positive(),
  actual: z.number().nonnegative().nullable(),
  forecast: z.number().nonnegative().nullable(),
  updatedAt: timestamp.optional(),
  observedAt: timestamp,
});
export const eventSchema = z.object({
  id: z.number().int().positive(),
  kind: z.enum([
    'health',
    'deployment',
    'source',
    'note',
    'backup',
    'worklog',
    'notification',
    'scenario',
  ]),
  serviceId: z.string(),
  createdAt: timestamp,
  observedAt: timestamp.optional(),
  title: z.string(),
  detail: z.string(),
  actor: z.string(),
  source: z.string(),
});
export const noteInputSchema = z
  .object({
    serviceId: identifierSchema,
    text: z.string().trim().min(1).max(4000),
  })
  .strict();
export const backupInputSchema = z
  .object({
    serviceId: identifierSchema,
    verifiedAt: timestamp,
    dueAt: timestamp,
    evidence: z.string().trim().min(10).max(4000),
  })
  .strict()
  .refine(
    v => Date.parse(v.dueAt) > Date.parse(v.verifiedAt),
    'Next check must follow verification',
  );
export const budgetPreferenceSchema = z
  .object({
    amount: z.number().positive().max(1000000000),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict();
export const notificationSettingsSchema = z
  .object({
    provider: z.enum(['disabled', 'resend', 'sns']),
    recipient: z.union([z.literal(''), z.string().email().max(254)]),
    sender: z.union([z.literal(''), z.string().email().max(254)]),
    automatic: z.boolean(),
  })
  .strict()
  .refine(
    v => v.provider !== 'resend' || Boolean(v.recipient && v.sender),
    'Resend requires a sender and recipient',
  );
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export const worklogInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    eventIds: z.array(z.number().int().positive()).min(1).max(100),
  })
  .strict();
export const documentSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['worklog', 'note', 'backup']),
  serviceId: z.string(),
  title: z.string(),
  markdown: z.string(),
  createdAt: timestamp,
  actor: z.string(),
});
export type Service = z.infer<typeof serviceSchema>;
export type Deployment = z.infer<typeof deploymentSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type OperationEvent = z.infer<typeof eventSchema>;
export type OperationDocument = z.infer<typeof documentSchema>;

// Receipt is a human attestation. Provider acceptance alone never changes it.
export type NotificationAttempt = {
  id: string;
  createdAt: string;
  subject: string;
  status:
    | 'queued'
    | 'sending'
    | 'retrying'
    | 'accepted'
    | 'failed'
    | 'simulated'
    | 'uncertain'
    | 'cancelled';
  attemptCount: number;
  nextAttemptAt?: string;
  lastAttemptAt?: string;
  receivedAt?: string;
  receivedBy?: string;
  error?: string;
};
export type Notifications = {
  settings: NotificationSettings;
  available: { resend: boolean; sns: boolean };
  simulated: boolean;
  canWrite: boolean;
  attempts: NotificationAttempt[];
  queue: Record<NotificationAttempt['status'], number>;
  worker: { intervalSeconds: number; lastRunAt?: string };
  subscriptions: {
    status: 'not-applicable' | 'available' | 'unavailable';
    confirmed?: number;
    pending?: number;
  };
};
export type Workspace = {
  source: 'none' | 'demo' | 'ssh' | 'cloudwatch';
  sourceStatus: 'available' | 'unavailable';
  evaluatedAt: string;
  maxAgeSeconds: number;
  canWrite: boolean;
  services: Service[];
  deployments: {
    status: 'unconfigured' | 'available' | 'unavailable';
    items: Deployment[];
  };
  costs: {
    status: 'unconfigured' | 'available' | 'unavailable';
    budget?: Budget;
    preference?: z.infer<typeof budgetPreferenceSchema>;
  };
  scenarios: Array<{ id: string; title: string; description: string }>;
  activeScenario?: string;
  backups: Array<
    z.infer<typeof backupInputSchema> & { actor: string; recordedAt: string }
  >;
};

export function evidenceAge(
  timestampValue: string | undefined,
  maxAgeSeconds: number,
  now = Date.now(),
) {
  if (!timestampValue) return 'unknown';
  const age = now - Date.parse(timestampValue);
  if (!Number.isFinite(age) || age < -60000) return 'unknown';
  return age > maxAgeSeconds * 1000 ? 'stale' : 'current';
}
