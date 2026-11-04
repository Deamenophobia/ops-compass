import { createPermission } from '@backstage/plugin-permission-common';
import { z } from 'zod/v3';

// Stable migration target and header contract. Browser selection never grants access.
export const DEFAULT_WORKSPACE_ID = 'personal';
export const WORKSPACE_HEADER = 'X-Ops-Workspace';
export const workspaceIdSchema = z.union([
  z.literal(DEFAULT_WORKSPACE_ID),
  z.string().uuid(),
]);
export const profileSchema = z.enum(['personal', 'team']);
export const workspaceRoleSchema = z.enum(['admin', 'user']);
export const memberRefSchema = z
  .string()
  .regex(/^user:[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/)
  .max(255);
export const workspaceNameSchema = z.string().trim().min(1).max(80);
export const workspaceSchema = z.object({
  id: workspaceIdSchema,
  name: workspaceNameSchema,
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export const workspaceMembershipSchema = z.object({
  userEntityRef: memberRefSchema,
  role: workspaceRoleSchema,
});
export const workspaceSummarySchema = workspaceSchema.extend({
  role: workspaceRoleSchema,
});
export const workspacesResponseSchema = z.object({
  profile: profileSchema,
  userEntityRef: memberRefSchema,
  canCreate: z.boolean(),
  items: z.array(workspaceSummarySchema),
});
export type WorkspaceProfile = z.infer<typeof profileSchema>;
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type WorkspaceRecord = z.infer<typeof workspaceSchema>;
export type WorkspaceMembership = z.infer<typeof workspaceMembershipSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type WorkspacesResponse = z.infer<typeof workspacesResponseSchema>;
export type WorkspaceResource = WorkspaceRecord & {
  members: WorkspaceMembership[];
};
export type WorkspaceCapability = 'read' | 'contribute' | 'admin';

export const WORKSPACE_RESOURCE_TYPE = 'ops-compass-workspace';
export const workspaceCreatePermission = createPermission({
  name: 'ops.workspace.create',
  attributes: { action: 'create' },
});
export const workspaceReadPermission = createPermission({
  name: 'ops.workspace.read',
  attributes: { action: 'read' },
  resourceType: WORKSPACE_RESOURCE_TYPE,
});
export const workspaceContributePermission = createPermission({
  name: 'ops.workspace.contribute',
  attributes: { action: 'update' },
  resourceType: WORKSPACE_RESOURCE_TYPE,
});
export const workspaceAdminPermission = createPermission({
  name: 'ops.workspace.admin',
  attributes: { action: 'update' },
  resourceType: WORKSPACE_RESOURCE_TYPE,
});
export const workspacePermissions = [
  workspaceReadPermission,
  workspaceContributePermission,
  workspaceAdminPermission,
];
export const capabilityPermissions = {
  read: workspaceReadPermission,
  contribute: workspaceContributePermission,
  admin: workspaceAdminPermission,
};
