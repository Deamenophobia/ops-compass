# Personal and team workspaces

Personal mode is the default. Your existing notes, worklogs, settings and
connections stay in **Personal workspace** after upgrading. Visit **Workspaces**
to rename it, and **Workspace features** to choose the optional tools you need.

## Enable team mode

Set this in your private configuration overlay, then restart the backend:

```yaml
opsCompass:
  profile: team
permission:
  enabled: true
```

Team mode needs distinct authenticated identities for real collaboration. Use the
[production sign-in guide](production-setup.md); local guest login represents one
person and cannot demonstrate separate human accounts. Configure the initial
`opsCompass.writers` identities **before the first upgrade**: they become the
administrators of the existing personal workspace. Later membership changes are
made on the Workspaces page, not by editing this bootstrap list.

1. Open **Workspaces**, enter a name and select **Create workspace**.
2. Select that workspace in the list or sidebar.
3. Add an existing Backstage identity, such as `user:default/alex`, and choose its
   role. Use the exact identity from that user's account; this form does not create
   a login account or send an invitation.
4. Enable the required modules on **Workspace features**.
5. Configure sources for that workspace, as described below.

| Action | Administrator | User |
| --- | --- | --- |
| Read the workspace and enabled operational features | Yes | Yes |
| Record notes, worklogs and backup attestations; refresh observations | Yes | Yes |
| Change feature choices, connections, alert routes and planning budget | Yes | No |
| Rename workspace and manage members | Yes | No |
| Create a workspace in team mode | Yes | Yes |

Membership is specific to each workspace. The creator is its first administrator.
At least one administrator must remain; stale edits are rejected so one browser
does not overwrite another's changes. Reload the page after a conflict.
Creating workspaces is allowed for authenticated users by the default policy;
install a different Backstage permission policy if your organization restricts it.

## Connect workspace-specific sources

New workspaces start unconfigured with optional modules off. They do not copy
another workspace's cloud account, SSH references, notification addresses or files.
The existing `opsCompass` source settings continue to configure `personal`.
For another workspace, copy its ID from the Workspaces page and configure a private
backend overlay:

```yaml
opsCompass:
  profile: team
  workspaceSources:
    - workspaceId: 2b4e3c6b-8cc0-4b65-975b-d66a02d5b082 # Replace with the actual ID.
      settings:
        mode: snapshot
        snapshotFile: ../../private/team-observations.json
        features:
          defaults:
            services: true
            history: true
```

Settings use the existing [source configuration](workspace-setup.md) format. Paths
retain the backend working-directory rules. Each workspace's testing allowlists,
inventory, GitLab projects, AWS alarms and notification credentials must be
configured explicitly in its settings. Restart after editing backend configuration.
Saving a connection profile in the UI still does not start collection or deployment.

The browser sends `X-Ops-Workspace` on operational requests. Missing headers select
`personal` for compatibility; changing the header cannot grant access. The server
checks the authenticated identity for each requested workspace. Saved views are
scoped to identity and workspace; selecting another workspace clears mounted page
state and reloads its feature choices.

## AI clients

The existing three MCP tools accept an optional `workspaceId` argument. The
default is `personal`. HTTP clients send `X-Ops-Workspace` instead. Both routes
use the same permission checks and feature settings.

The existing local service token is read-only and supported only for personal
mode. Team mode rejects service-only credentials: clients must carry a real,
authorized Backstage user identity. This release does not provision an OAuth
client or add a separate token issuer. Turning on team mode does not make an old
local MCP token a team credential.

## Upgrade and rollback

Stop the backend and [back up the complete operations database](storage-and-delivery.md)
before upgrading. Migration `003-workspace-scope` assigns all existing operational
records to `personal`; core migration `001-workspace-directory` adds memberships.
The backup includes both table families. Start the upgraded application and verify
old notes, settings and delivery receipts before resuming normal operation.

Changing back to personal mode hides additional workspaces and stops their workers
after restart; their data is retained. Existing personal-workspace memberships also
remain: switching profiles does not revoke users. This does not undo database migrations.
For an application downgrade, restore the verified pre-upgrade backup to a new
path and run the matching old application version. Never point v0.1.0 at an upgraded
database. Changes made after the backup will need separate preservation.

The initial implementation supports up to 100 workspaces in one backend process.
It has no workspace deletion or invitation workflow. Catalog entities, search,
TechDocs and their ownership metadata remain shared. Do not use this boundary to
host mutually untrusted organizations in one Backstage installation.
