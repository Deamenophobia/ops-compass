// Local configuration smoke test; dummy OAuth values never reach GitLab.
// Uses an isolated database and loopback listener, then stops its own child process.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const { values } = parseArgs({ options: { root: { type: 'string' } } });
const root = resolve(
  values.root ?? join(dirname(fileURLToPath(import.meta.url)), '..'),
);
const require = createRequire(join(root, 'package.json'));
const { chromium, expect } = require('@playwright/test');
await access(join(root, 'packages/app/dist/index.html'));
await mkdir(join(root, 'private'), { recursive: true });
const output = await mkdtemp(join(root, 'private/production-check-'));
const dbDir = join(output, 'databases');
await mkdir(dbDir);
const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise((done, error) => probe.close(e => (e ? error(e) : done())));
const baseURL = `http://127.0.0.1:${port}`;
const overlay = join(output, 'overlay.json');
await writeFile(
  overlay,
  JSON.stringify({
    backend: { listen: { host: '127.0.0.1', port } },
    catalog: {
      locations: [
        { type: 'file', target: join(root, 'catalog-info.yaml') },
        { type: 'file', target: join(root, 'catalog/entities.yaml') },
        {
          type: 'file',
          target: join(root, 'examples/production-identities.yaml'),
        },
      ],
    },
  }),
);
// Strip inherited provider credentials; this check has no live integration target.
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !/^AWS_|^OPENAI_|^AUTH_GITLAB_|^OPS_COMPASS_|^APP_CONFIG_/i.test(key),
  ),
);
Object.assign(env, {
  NODE_ENV: 'production',
  NODE_OPTIONS: '--max-old-space-size=1024',
  PORTAL_BASE_URL: baseURL,
  PORTAL_DATA_DIR: dbDir,
  PORTAL_OWNER_REF: 'user:default/portal-owner',
  PORTAL_IDENTITIES_FILE: join(root, 'examples/production-identities.yaml'),
  AUTH_GITLAB_CLIENT_ID: 'ops-compass-local-smoke-not-a-real-client',
  AUTH_GITLAB_CLIENT_SECRET: 'ops-compass-local-smoke-not-a-real-secret',
});
let backend;
let log;
let browser;
let startupOutput = '';
async function start(name) {
  startupOutput = '';
  console.log(`Checking production ${name} on an isolated loopback port...`);
  log = createWriteStream(join(output, `${name}.log`));
  backend = spawn(
    process.execPath,
    [
      '--require',
      join(root, 'node_modules/@backstage/cli-node/config/nodeTransform.cjs'),
      'src/index.ts',
      '--config',
      join(root, 'app-config.yaml'),
      '--config',
      join(root, 'app-config.production.yaml'),
      '--config',
      overlay,
    ],
    {
      cwd: join(root, 'packages/backend'),
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  backend.stdout.pipe(log, { end: false });
  backend.stderr.pipe(log, { end: false });
  for (const stream of [backend.stdout, backend.stderr])
    stream.on('data', chunk => {
      startupOutput = (startupOutput + chunk.toString()).slice(-65536);
    });
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    if (backend.exitCode !== null)
      throw Error(`Backend stopped: inspect ${output}`);
    if (startupOutput.includes('threw an error during startup'))
      throw Error(`Backend initialization failed: inspect ${output}`);
    try {
      const response = await fetch(
        `${baseURL}/.backstage/health/v1/readiness`,
        { signal: AbortSignal.timeout(2000) },
      );
      if (response.ok) return;
    } catch {
      /* Cold startup: retry only the local readiness read. */
    }
    await delay(1000);
  }
  throw Error(`Readiness timed out: inspect ${output}`);
}
async function stop() {
  if (backend && backend.exitCode === null) {
    const exited = once(backend, 'exit');
    backend.kill('SIGTERM');
    await Promise.race([exited, delay(10000)]);
    if (backend.exitCode === null && backend.signalCode === null) {
      backend.kill('SIGKILL');
      await exited;
    }
  }
  if (log) await new Promise(done => log.end(done));
  backend = undefined;
  log = undefined;
}
const watchdog = setTimeout(() => {
  backend?.kill('SIGKILL');
}, 360000);
try {
  await start('first-boot');
  const response = await fetch(`${baseURL}/api/operations/overview`);
  assert.equal(
    response.status,
    401,
    'Unauthenticated Operations must be rejected',
  );
  const guest = await fetch(`${baseURL}/api/auth/guest/refresh`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  assert.equal(
    guest.status,
    404,
    'Production must not expose a guest token endpoint',
  );
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.route('**/*', route =>
    new URL(route.request().url()).origin === baseURL
      ? route.continue()
      : route.abort(),
  );
  await page.goto(baseURL);
  await expect(page.getByText('GitLab', { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(
    page.getByRole('button', { name: 'Sign In', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Enter', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Guest', { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: join(output, 'gitlab-sign-in.png'),
    fullPage: true,
  });
  await browser.close();
  browser = undefined;
  await stop();
  const files = (await readdir(dbDir)).filter(
    name => name.endsWith('.sqlite') || name.endsWith('.sqlite3'),
  );
  assert.ok(files.length >= 4, 'Expected persistent plugin databases');
  const Database = require('better-sqlite3');
  function state() {
    const journal = new Database(join(dbDir, 'operations.sqlite'), {
      readonly: true,
    });
    try {
      return journal
        .prepare('SELECT name FROM sqlite_master WHERE type=? ORDER BY name')
        .all('table');
    } finally {
      journal.close();
    }
  }
  const before = state();
  assert.ok(before.length >= 10, 'Expected migrated operations journal');
  // A marker in this disposable journal distinguishes persistence from rebuilding
  // the same empty schema on every boot. No real portal database is opened.
  const marker = new Database(join(dbDir, 'operations.sqlite'));
  try {
    marker.exec('CREATE TABLE production_smoke_marker (value TEXT NOT NULL)');
    marker
      .prepare('INSERT INTO production_smoke_marker VALUES (?)')
      .run('restart-survived');
  } finally {
    marker.close();
  }
  await start('second-boot');
  await stop();
  assert.deepEqual(
    state().filter(row => row.name !== 'production_smoke_marker'),
    before,
    'Restart must preserve journal schema',
  );
  const restored = new Database(join(dbDir, 'operations.sqlite'), {
    readonly: true,
  });
  try {
    assert.equal(
      restored.prepare('SELECT value FROM production_smoke_marker').get().value,
      'restart-survived',
    );
  } finally {
    restored.close();
  }
  await writeFile(
    join(output, 'result.json'),
    JSON.stringify(
      {
        verified: true,
        guestDisabled: true,
        unauthenticatedRejected: true,
        gitlabOnlyScreen: true,
        persistentDatabases: files.length,
        journalTables: before.length,
        retainedMarker: true,
        liveOAuth: false,
      },
      null,
      2,
    ),
  );
  console.log(`Production configuration smoke passed. Evidence: ${output}`);
  console.log(
    'Verified boot/restart, persistent databases, GitLab-only screen and auth boundaries; no live OAuth login.',
  );
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close();
  await stop();
}
