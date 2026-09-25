# Private daily-use deployment

This configuration is for one portal backend. Local guest previews remain on
loopback. Hosting requires your GitLab OAuth application, HTTPS address, private
identity file and persistent data volume. The configuration and container recipe
are provided; completing a real OAuth sign-in requires those credentials.

## GitLab sign-in

1. Create a GitLab OAuth application with callback
   `https://YOUR_PORTAL/api/auth/gitlab/handler/frame`. Use the scopes required by
   the [Backstage GitLab provider](https://backstage.io/docs/auth/gitlab/provider/).
   The sign-in integration does not require permission to create merge requests.
2. Put its client ID and secret in private deployment environment variables
   `AUTH_GITLAB_CLIENT_ID` and `AUTH_GITLAB_CLIENT_SECRET`. Never put them in the
   frontend, repository or screenshot gallery.
3. Copy `examples/production-identities.yaml` to a private file. Replace its numeric
   GitLab user ID and choose a catalog name. Configure `PORTAL_OWNER_REF`, for example
   `user:default/portal-owner`. The resolver matches the immutable GitLab user-ID
   annotation; unknown users have no matching catalog identity and cannot sign in.
4. Set `auth.environment: production` through the supplied production configuration.
   The frontend then offers GitLab only, and the guest backend provider is removed.
   Keep production owner references separate from local guest ownership.

Register other users deliberately. This is not an organization-wide authorization
system: the custom Operations write APIs allow only configured owners, and its MCP
credential remains read-only. Review permissions of other installed plugins before
expanding access beyond the private personal portal.

## Build and start

Use Node 22 for the locked install and build, matching the image runtime:

```sh
node .yarn/releases/yarn-4.13.0.cjs install --immutable
node .yarn/releases/yarn-4.13.0.cjs tsc
node .yarn/releases/yarn-4.13.0.cjs build:all
docker build -f packages/backend/Dockerfile -t ops-compass:reviewed .
```

The image copies explicit public configuration files, not local overlays. Python
and locked TechDocs dependencies are included. It runs as the `node` user. Build
from `main` to exclude demo assets. Record the built image digest before deployment.

Set the Compose variables in a private environment: `PORTAL_IMAGE` (an immutable
registry digest), `PORTAL_BASE_URL`, `PORTAL_OWNER_REF`, `PORTAL_IDENTITIES_PATH`
(absolute path), and the two OAuth variables. Then:

```sh
docker compose -f deploy/compose.yaml config --quiet
docker compose -f deploy/compose.yaml up -d
```

Compose binds port 7007 to localhost and limits the portal to 2 GiB. Put your HTTPS
reverse proxy or private VPN in front of it. Verify the readiness endpoint,
`/.backstage/health/v1/readiness`, and perform a real sign-in and owner-only write
check before relying on the deployment. Do not publish a guest preview.

All plugin databases use separate files under `PORTAL_DATA_DIR`; the Operations
journal is `operations.sqlite` in that directory (`/data/backstage` in Compose).
Backstage joins each filename to the directory, so the plugin filename must remain
relative. Do not supply an absolute filename alongside the directory. This keeps auth/catalog records across
restarts. SQLite requires one backend; use a separately tested PostgreSQL migration
if you later need multiple instances. A healthy process is not a successful login.

## Isolated production configuration check

After building the frontend, run this check from the repository root:

```sh
node scripts/test-production.mjs
```

The check starts the production backend on an available loopback port, supplies
dummy OAuth values, and creates fresh plugin databases under an ignored
`private/production-check-*` directory. It verifies readiness, rejects unauthenticated
Operations requests, checks that the guest token endpoint is unavailable, and opens
the GitLab-only sign-in screen with external browser requests blocked. It then
restarts the backend and verifies a marker survives in the isolated journal.
Its own backend process stops when the check finishes or fails; logs and a screen
capture remain in the private evidence directory. It needs the existing Node install
and Chrome. This exercises the real source backend with production configuration;
it does not exchange OAuth tokens, deploy a container or verify an external account.

## Backup and restore drill

The backup helper uses SQLite's backup API, an integrity check and a SHA-256 manifest.
It refuses existing output paths. Stop the portal for a coordinated backup of all
plugin databases and retain its matching source revision and private configuration.
For each database:

```sh
python scripts/journal-backup.py backup --source private/operations.sqlite --output private/backups/journal-NEW.sqlite
python scripts/journal-backup.py restore --source private/backups/journal-NEW.sqlite --output private/restore-drill/journal-NEW.sqlite
python scripts/journal-backup.py verify --source private/restore-drill/journal-NEW.sqlite
```

Inspect the restored records in isolation. The tool never replaces the running
journal. Keep encrypted off-host backups with access controls and a retention policy;
the helper does not configure these services. Restoring a backup loses later changes
and can resurrect old delivery intents, so follow the reconciliation procedure in
[Storage and delivery](storage-and-delivery.md) before enabling a restored worker.
