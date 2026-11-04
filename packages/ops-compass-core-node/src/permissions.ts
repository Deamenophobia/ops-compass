import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  AuthorizeResult,
  isPermission,
  isResourcePermission,
  PolicyDecision,
} from '@backstage/plugin-permission-common';
import {
  createConditionExports,
  createPermissionResourceRef,
  createPermissionRule,
  PermissionPolicy,
  PolicyQuery,
  PolicyQueryUser,
} from '@backstage/plugin-permission-node';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import { z } from 'zod/v3';
import {
  WORKSPACE_RESOURCE_TYPE,
  WorkspaceResource,
  workspaceAdminPermission,
  workspaceCreatePermission,
} from '@ops-compass/core';

export const workspaceResourceRef = createPermissionResourceRef<
  WorkspaceResource,
  { userEntityRef: string; adminOnly: boolean }
>().with({ pluginId: 'operations', resourceType: WORKSPACE_RESOURCE_TYPE });
export const workspaceMemberRule = createPermissionRule({
  name: 'WORKSPACE_MEMBER',
  description:
    'Match a Backstage identity to an explicitly assigned workspace role.',
  resourceRef: workspaceResourceRef,
  paramsSchema: z.object({ userEntityRef: z.string(), adminOnly: z.boolean() }),
  apply: (workspace, { userEntityRef, adminOnly }) =>
    workspace.members.some(
      member =>
        member.userEntityRef === userEntityRef &&
        (!adminOnly || member.role === 'admin'),
    ),
  toQuery: params => params,
});
export const {
  conditions: workspaceConditions,
  createConditionalDecision: createWorkspaceDecision,
} = createConditionExports({
  resourceRef: workspaceResourceRef,
  rules: { member: workspaceMemberRule },
});

/** Installed through Backstage's policy extension point; deployments can replace it. */
export class WorkspacePermissionPolicy implements PermissionPolicy {
  async handle(
    request: PolicyQuery,
    user?: PolicyQueryUser,
  ): Promise<PolicyDecision> {
    if (!user) return { result: AuthorizeResult.DENY };
    if (isPermission(request.permission, workspaceCreatePermission))
      return { result: AuthorizeResult.ALLOW };
    if (isResourcePermission(request.permission, WORKSPACE_RESOURCE_TYPE)) {
      return createWorkspaceDecision(
        request.permission,
        workspaceConditions.member({
          userEntityRef: user.info.userEntityRef,
          adminOnly: isPermission(request.permission, workspaceAdminPermission),
        }),
      );
    }
    // Catalog and TechDocs are shared within the trusted installation, not tenants.
    return { result: AuthorizeResult.ALLOW };
  }
}
export const workspacePermissionModule = createBackendModule({
  pluginId: 'permission',
  moduleId: 'ops-compass-workspace-policy',
  register(env) {
    env.registerInit({
      deps: { policy: policyExtensionPoint },
      async init({ policy }) {
        policy.setPolicy(new WorkspacePermissionPolicy());
      },
    });
  },
});
