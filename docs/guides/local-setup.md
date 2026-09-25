# Local setup

## Prerequisites

Use Node.js 22 or 24 and Python 3.12. The repository pins Yarn in `.yarn/releases`;
invoke it directly if a machine-wide Yarn installation is older. Backstage recommends
a Unix-like environment, including WSL, with at least 20 GB free and 6 GB RAM.
Native Windows with Node 22 is covered by the [release review record](../releases/preview.md).
Node 24 and Linux/WSL remain setup targets without a fresh-install check in that
record. Native modules may need Python and C++ build tools if a prebuilt binary
is unavailable.

Clone the desired branch into an empty directory first, then run every command
below from that repository root.

```sh
git clone --branch main https://github.com/Deamenophobia/ops-compass.git
cd ops-compass
```

Use `--branch demo` instead for the illustrated examples. Both public branches
are available without access to the development repository.

```sh
node .yarn/releases/yarn-4.13.0.cjs install --immutable
python -m venv .venv
```

Windows:

```powershell
.venv/Scripts/python.exe -m pip install -r requirements-docs.txt
$env:PATH = "$PWD\.venv\Scripts;$env:PATH"
.\scripts\start-local.ps1
```

Linux / WSL:

```sh
.venv/bin/python -m pip install -r requirements-docs.txt
export PATH="$PWD/.venv/bin:$PATH"
node .yarn/releases/yarn-4.13.0.cjs start
```

Open `http://localhost:3000` and enter as Guest. The development guest identity is
local-only; do not expose this development server or enable guest access in production.
The backend listens on loopback port 7007. The development catalog uses an in-memory
SQLite database and reloads the committed catalog files at startup.

## Choose a branch

`main` has no sample services or runtime fixtures. Its initial health is unknown;
optional modules start off. Open **Workspace features** to enable what you need;
use the host or CloudWatch guide to connect your own observations. The self-catalog
entry and local guest ownership remain so the handbook and sign-in work.

`demo` adds synthetic observations, a sample service family and a screenshot gallery.
On Windows, use `scripts/start-local.ps1` or `scripts/start-preview.ps1`. On Linux/WSL,
pass both configuration files explicitly:

```sh
node .yarn/releases/yarn-4.13.0.cjs start --config app-config.yaml --config app-config.demo.yaml
```

Stop the portal before switching branches. See [Branch workflow](repository-workflow.md).

## Verify

```sh
node .yarn/releases/yarn-4.13.0.cjs tsc
node .yarn/releases/yarn-4.13.0.cjs lint:all
node .yarn/releases/yarn-4.13.0.cjs test --watchAll=false --runInBand
python -m unittest discover -s scripts -p "test_*.py"
mkdocs build --strict
node .yarn/releases/yarn-4.13.0.cjs build:all
node scripts/test-connections.mjs --features
node scripts/test-connections.mjs
```

The browser checks use installed Google Chrome; see `playwright.config.ts`.
Add `--demo` to both harness commands on the demo branch. They cover startup,
catalog, handbook, feature settings, connections and inventory in isolated journals.
Test/build evidence belongs in the worklog with the commit and environment.

On a memory-constrained Windows machine, run package tests separately:

```sh
node .yarn/releases/yarn-4.13.0.cjs workspace @ops-compass/operations-common test --watchAll=false --runInBand
node .yarn/releases/yarn-4.13.0.cjs workspace @ops-compass/plugin-operations-backend test --watchAll=false --runInBand
```

The PowerShell helpers start an unconfigured workspace on `main`. On `demo`, they
automatically load the tracked `app-config.demo.yaml` overlay. To use your own
source, pass `-ConnectionConfig ./app-config.connections.local.yaml`. Prepare it
from the [Connections page](connections.md). Starting the portal does not run SSH
or collect host evidence; run the collector separately with your own targets.

## Lower-memory preview

After `build:all`, run `scripts/start-preview.ps1` and open `http://localhost:7007`.
This serves the built frontend from the backend; it has no frontend hot reload and
is still local development mode. The Windows preview starts the backend directly
without the development watcher; restart it after backend source changes. This
avoids the watcher's `DevDataStore.load` IPC timeout on a slow startup. The regular
`start-local.ps1` development command retains hot reload. The preview also accepts `-ConnectionConfig` with your
explicit private overlay and does not run a collector. For browser tests against that running preview, set
`PLAYWRIGHT_URL=http://localhost:7007` and `PLAYWRIGHT_SKIP_WEBSERVER=1` in the test
process environment, then run the read-only core walkthrough:

```sh
node .yarn/releases/yarn-4.13.0.cjs test:e2e --project=app-chromium app.test.ts
```

Set `PLAYWRIGHT_EXPECT_MODE=demo` on demo. Optional-module suites expect their
modules enabled; use the isolated harnesses below for settings and connection writes.

On Linux/WSL, serve the built frontend with:

```sh
node .yarn/releases/yarn-4.13.0.cjs start backend --config app-config.yaml --config app-config.preview.yaml
```

On demo, append `--config app-config.demo.yaml`. Keep the virtual environment on
PATH so TechDocs can render the handbook.

## Verify a fresh workspace without changing your journal

After installing dependencies and building, run:

```sh
node scripts/test-connections.mjs --features
```

On demo use `node scripts/test-connections.mjs --demo --features`. This boots a
temporary backend on a random loopback port with a new journal, opens the catalog
and handbook, checks default features, and exercises save/reload and disabled
routes. It uses installed Google Chrome, ignores user overlays and strips provider
credentials from the test process. Results are kept under the ignored `private/`
directory. It stops its own backend when finished. The existing preview stays open.

`node scripts/test-connections.mjs` (add `--demo` on demo) separately verifies
connection forms and inventory with those two modules enabled for the test.

## Common failures

- Port already occupied: stop only your own previous portal process or configure a
  different frontend/backend port and matching URLs.
- Native SQLite build failure: use supported Node and C++ build tools, or WSL.
- TechDocs cannot find `mkdocs`: start the backend with the virtual environment on PATH.
- Unknown/stale checks: collect fresh evidence; page refresh alone does not run SSH.
- Dependency age quarantine: select a compatible release older than the repository's
  three-day minimum age. Do not disable the gate just to fetch a newer version.
