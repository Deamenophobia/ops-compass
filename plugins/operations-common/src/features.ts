import { z } from 'zod/v3';

export const featureDefinitions = [
  {
    id: 'services',
    title: 'Services and pipelines',
    description:
      'Container details, deployed revisions and GitLab pipeline comparisons.',
  },
  {
    id: 'inventory',
    title: 'AWS inventory',
    description: 'Browse collected instances and regional coverage.',
  },
  {
    id: 'connections',
    title: 'Cloud connections',
    description:
      'Prepare, save and explicitly test your own AWS or SSH profiles.',
  },
  {
    id: 'history',
    title: 'Activity history',
    description: 'Record observed changes and browse the operations timeline.',
  },
  {
    id: 'worklogs',
    title: 'Worklogs',
    description:
      'Draft, review and save Markdown reports from recorded evidence.',
  },
  {
    id: 'notifications',
    title: 'Email notifications',
    description:
      'Configure routes, test delivery and send enabled transition alerts.',
  },
  {
    id: 'costs',
    title: 'Cost tracking',
    description:
      'Read a configured AWS Budget and keep a local planning amount.',
  },
  {
    id: 'maintenance',
    title: 'Maintenance notes',
    description: 'Keep service notes and user-attested backup reminders.',
  },
  {
    id: 'agent',
    title: 'AI agent interface',
    description:
      'Provide read-only evidence and runbooks through HTTP and MCP.',
  },
] as const;
export type FeatureId = (typeof featureDefinitions)[number]['id'];
export const featureFlagsSchema = z
  .object({
    services: z.boolean(),
    inventory: z.boolean(),
    connections: z.boolean(),
    history: z.boolean(),
    worklogs: z.boolean(),
    notifications: z.boolean(),
    costs: z.boolean(),
    maintenance: z.boolean(),
    agent: z.boolean(),
  })
  .strict();
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;
export const featurePreset = (enabled: boolean): FeatureFlags =>
  Object.fromEntries(
    featureDefinitions.map(feature => [feature.id, enabled]),
  ) as FeatureFlags;
export const workspaceFeatures = [
  'services',
  'history',
  'worklogs',
  'notifications',
  'costs',
  'maintenance',
] as const satisfies readonly FeatureId[];
export const featureStateSchema = z
  .object({
    version: z.number().int().nonnegative(),
    enabled: featureFlagsSchema,
    updatedAt: z.string().datetime().optional(),
    updatedBy: z.string().optional(),
  })
  .strict();
export const featureResponseSchema = featureStateSchema.extend({
  canWrite: z.boolean(),
});
export type FeatureState = z.infer<typeof featureStateSchema>;
export type FeatureResponse = z.infer<typeof featureResponseSchema>;
