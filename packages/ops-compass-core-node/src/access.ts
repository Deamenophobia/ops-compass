import {
  AuthService,
  BackstageCredentials,
  HttpAuthService,
  PermissionsService,
  PermissionsRegistryService,
} from '@backstage/backend-plugin-api';
import { NotAllowedError } from '@backstage/errors';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { Request } from 'express';
import {
  capabilityPermissions,
  DEFAULT_WORKSPACE_ID,
  WorkspaceCapability,
  WorkspaceProfile,
  workspaceCreatePermission,
  workspacePermissions,
} from '@ops-compass/core';
import { workspaceMemberRule, workspaceResourceRef } from './permissions';
import { WorkspaceDirectory } from './store';

export type WorkspaceActor = (
  req: Request,
  capability: WorkspaceCapability,
) => Promise<string | undefined>;

export function registerWorkspacePermissions(
  registry: PermissionsRegistryService,
  directory: WorkspaceDirectory,
) {
  registry.addPermissions([workspaceCreatePermission]);
  registry.addResourceType({
    resourceRef: workspaceResourceRef,
    permissions: workspacePermissions,
    rules: [workspaceMemberRule],
    getResources: refs => Promise.all(refs.map(id => directory.get(id))),
  });
}

export class WorkspaceAccess {
  constructor(
    readonly profile: WorkspaceProfile,
    private readonly httpAuth: HttpAuthService,
    private readonly permissions: PermissionsService,
    private readonly auth: AuthService,
  ) {}
  credentials(req: Request) {
    return this.httpAuth.credentials(req, { allow: ['user', 'service'] });
  }
  async allowed(
    credentials: BackstageCredentials,
    workspaceId: string,
    capability: WorkspaceCapability,
  ) {
    // Preserve the existing explicitly scoped local AI interface only for the
    // personal workspace. Team agents must carry an actual member's identity.
    if (
      !this.auth.isPrincipal(credentials, 'user') &&
      !(
        this.auth.isPrincipal(credentials, 'service') &&
        this.profile === 'personal' &&
        workspaceId === DEFAULT_WORKSPACE_ID &&
        capability === 'read'
      )
    )
      return false;
    const [decision] = await this.permissions.authorize(
      [
        {
          permission: capabilityPermissions[capability],
          resourceRef: workspaceId,
        },
      ],
      { credentials },
    );
    return decision.result === AuthorizeResult.ALLOW;
  }
  async require(
    credentials: BackstageCredentials,
    id: string,
    capability: WorkspaceCapability,
  ) {
    if (!(await this.allowed(credentials, id, capability)))
      throw new NotAllowedError(
        'You do not have access to this workspace action.',
      );
  }
  actor(id: string): WorkspaceActor {
    return async (req, capability) => {
      try {
        const credentials = await this.credentials(req);
        if (
          credentials.principal.type !== 'user' ||
          !(await this.allowed(credentials, id, capability))
        )
          return undefined;
        return credentials.principal.userEntityRef;
      } catch {
        return undefined;
      }
    };
  }
  async canCreate(credentials: BackstageCredentials) {
    if (this.profile !== 'team' || !this.auth.isPrincipal(credentials, 'user'))
      return false;
    const [decision] = await this.permissions.authorize(
      [{ permission: workspaceCreatePermission }],
      { credentials },
    );
    return decision.result === AuthorizeResult.ALLOW;
  }
}
