// Exercise the actual old and candidate HTTP APIs with a synthetic journal only.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const { values } = parseArgs({
  options: {
    'previous-root': { type: 'string' },
    root: { type: 'string' },
    python: { type: 'string', default: 'python' },
  },
});
assert(
  values['previous-root'],
  'Supply --previous-root pointing to an installed, built published checkout',
);
const root = resolve(
  values.root ?? join(dirname(fileURLToPath(import.meta.url)), '..'),
);
const previous = resolve(values['previous-root']);
assert.notEqual(
  root,
  previous,
  'Use separate candidate and previous checkouts',
);
for (const repo of [root, previous])
  await access(join(repo, 'packages/app/dist/index.html'));
await mkdir(join(root, 'private'), { recursive: true });
const output = await mkdtemp(join(root, 'private/upgrade-check-'));
const database = join(output, 'synthetic.sqlite');
const fixture = join(output, 'observations.json');
await writeFile(
  fixture,
  JSON.stringify({
    schemaVersion: 1,
    source: 'demo',
    observations: [],
    services: [
      {
        id: 'upgrade-sample',
        name: 'Upgrade sample',
        entityRef: 'component:default/upgrade-sample',
        host: 'example.test',
        environment: 'demo',
        observedAt: new Date().toISOString(),
        containers: [],
      },
    ],
  }),
);
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !/^(AWS_|OPENAI_|AUTH_GITLAB_|OPS_COMPASS_|APP_CONFIG_|PORTAL_)/i.test(
        key,
      ),
  ),
);
Object.assign(env, {
  NODE_ENV: 'development',
  NODE_OPTIONS: '--max-old-space-size=2048',
});
let child, log, baseURL, token;
const completed = [];
async function stop() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await Promise.race([exited, delay(10000)]);
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL');
    await exited;
  }
  if (log) await new Promise(done => log.end(done));
  child = log = undefined;
}
async function start(repo, file, stage) {
  await stop();
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((done, fail) =>
    probe.close(error => (error ? fail(error) : done())),
  );
  baseURL = `http://127.0.0.1:${port}`;
  const overlay = join(output, `${stage}.json`);
  await writeFile(
    overlay,
    JSON.stringify({
      app: { baseUrl: baseURL },
      backend: {
        baseUrl: baseURL,
        listen: { host: '127.0.0.1', port },
        cors: { origin: baseURL },
        // Backstage's SQLite connector expects portable, relative paths on Windows.
        database: {
          client: 'better-sqlite3',
          connection: ':memory:',
          plugin: {
            operations: {
              connection: {
                filename: relative(
                  join(repo, 'packages/backend'),
                  file,
                ).replaceAll('\\', '/'),
              },
            },
          },
        },
      },
      catalog: {
        locations: [
          { type: 'file', target: join(repo, 'catalog-info.yaml') },
          { type: 'file', target: join(repo, 'catalog/entities.yaml') },
        ],
      },
      opsCompass: {
        mode: 'demo',
        profile: 'team',
        demoFile: fixture,
        writers: ['user:default/guest'],
        features: {
          defaults: {
            services: false,
            inventory: false,
            connections: false,
            history: false,
            worklogs: false,
            notifications: false,
            costs: true,
            maintenance: true,
            agent: false,
            ...(repo === root
              ? { kubernetes: false, dependencies: false }
              : {}),
          },
        },
      },
    }),
  );
  log = createWriteStream(join(output, `${stage}.log`));
  child = spawn(
    process.execPath,
    [
      '--require',
      join(repo, 'node_modules/@backstage/cli-node/config/nodeTransform.cjs'),
      'src/index.ts',
      '--config',
      join(repo, 'app-config.yaml'),
      '--config',
      overlay,
    ],
    {
      cwd: join(repo, 'packages/backend'),
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  let startup = '';
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', data => {
      startup = (startup + data).slice(-65536);
    });
  const deadline = Date.now() + 150000;
  let ready = false;
  while (Date.now() < deadline) {
    assert(
      child.exitCode === null &&
        !startup.includes('threw an error during startup'),
      `Startup failed; inspect ${stage}.log`,
    );
    try {
      ready = (
        await fetch(`${baseURL}/.backstage/health/v1/readiness`, {
          signal: AbortSignal.timeout(2000),
        })
      ).ok;
    } catch {
      /* Retry local startup. */
    }
    if (ready) break;
    await delay(500);
  }
  assert(ready, 'Local backend readiness timed out');
  const response = await fetch(`${baseURL}/api/auth/guest/refresh`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200, 'Synthetic guest sign-in');
  token = (await response.json()).backstageIdentity.token;
  assert(token, 'Guest token missing');
}
async function api(path, body, workspace) {
  const response = await fetch(`${baseURL}/api/operations${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(workspace ? { 'X-Ops-Workspace': workspace } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  assert(response.ok, `${path} returned ${response.status}`);
  return response.json();
}
function copy(action, source, destination) {
  const result = spawnSync(
    values.python,
    [
      join(root, 'scripts/journal-backup.py'),
      action,
      '--source',
      source,
      '--output',
      destination,
    ],
    { windowsHide: true, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, `Journal ${action} failed: ${result.stderr}`);
}
let savedFeatures, note, extra;
async function verifyRetained(candidate) {
  const features = await api('/features');
  for (const [key, value] of Object.entries(savedFeatures.enabled))
    assert.equal(features.enabled[key], value, `Feature ${key} retained`);
  assert.equal(features.version, savedFeatures.version);
  if (candidate)
    assert.equal(
      features.enabled.kubernetes,
      false,
      'New optional feature stays disabled',
    );
  if (candidate)
    assert.equal(
      features.enabled.dependencies,
      false,
      'Dependency view stays disabled for saved choices',
    );
  const documents = (await api('/documents')).items;
  assert(
    documents.some(
      item =>
        item.id === note.id &&
        item.markdown.includes('Synthetic retained note'),
    ),
    'Saved note retained',
  );
  assert.deepEqual((await api('/workspace')).costs.preference, {
    amount: 25,
    currency: 'USD',
  });
  if (candidate) {
    const workspaces = await api('/workspaces');
    assert.equal(
      workspaces.items.find(item => item.id === 'personal')?.role,
      'admin',
    );
    if (extra) {
      const workspace = await api(`/workspaces/${extra.id}`);
      assert(
        workspace.members.some(
          item =>
            item.userEntityRef === 'user:default/example' &&
            item.role === 'user',
        ),
      );
      assert(
        !(await api('/documents', undefined, extra.id)).items.some(
          item => item.id === note.id,
        ),
        'New workspace does not inherit notes',
      );
    }
  }
}
const watchdog = setTimeout(() => child?.kill('SIGKILL'), 900000);
try {
  await start(previous, database, 'published-seed');
  const flags = await api('/features');
  savedFeatures = await api('/features', {
    version: flags.version,
    enabled: flags.enabled,
  });
  note = await api('/notes', {
    serviceId: 'upgrade-sample',
    text: 'Synthetic retained note',
  });
  await api('/budget-preference', { amount: 25, currency: 'USD' });
  await verifyRetained(false);
  await stop();
  const before = join(output, 'before.sqlite');
  copy('backup', database, before);
  completed.push('Published application seeded; pre-upgrade backup verified');
  await start(root, database, 'candidate-upgrade');
  await verifyRetained(true);
  extra = await api('/workspaces', { name: 'Synthetic team' });
  await api(`/workspaces/${extra.id}/members`, {
    version: extra.version,
    userEntityRef: 'user:default/example',
    role: 'user',
  });
  const flags2 = await api('/features', undefined, extra.id);
  await api(
    '/features',
    {
      version: flags2.version,
      enabled: { ...flags2.enabled, maintenance: true },
    },
    extra.id,
  );
  await verifyRetained(true);
  completed.push(
    'Candidate upgrade preserves notes, budget, feature choices and ownership; workspace isolation verified',
  );
  await start(root, database, 'candidate-restart');
  await verifyRetained(true);
  await stop();
  completed.push(
    'Restart preserves journal, workspace membership and feature choices',
  );
  const after = join(output, 'after.sqlite');
  copy('backup', database, after);
  const restored = join(output, 'restored.sqlite');
  copy('restore', after, restored);
  await start(root, restored, 'candidate-restored');
  await verifyRetained(true);
  await stop();
  completed.push('Post-upgrade backup restores into candidate successfully');
  const rollback = join(output, 'rollback.sqlite');
  copy('restore', before, rollback);
  await start(previous, rollback, 'published-rollback');
  await verifyRetained(false);
  completed.push(
    'Pre-upgrade backup restores into published application successfully',
  );
  await writeFile(
    join(output, 'result.json'),
    JSON.stringify(
      { verifiedAt: new Date().toISOString(), synthetic: true, completed },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, completed, output }, null, 2));
} finally {
  clearTimeout(watchdog);
  await stop();
}
