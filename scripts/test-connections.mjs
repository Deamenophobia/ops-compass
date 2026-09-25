// Isolated browser verification. Never loads a user's connection overlay or journal.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = process.argv.includes('--demo');
const capture = process.argv.includes('--capture');
const features = process.argv.includes('--features');
if (capture && !demo) throw new Error('Gallery capture requires --demo.');
await access(join(root, 'packages/app/dist/index.html'));
await mkdir(join(root, 'private'), { recursive: true });
const output = await mkdtemp(join(root, 'private/connections-check-'));
const portProbe = createServer();
portProbe.listen(0, '127.0.0.1');
await once(portProbe, 'listening');
const port = portProbe.address().port;
await new Promise((resolve, reject) =>
  portProbe.close(error => (error ? reject(error) : resolve())),
);
const baseURL = `http://127.0.0.1:${port}`;
const overlay = join(output, 'overlay.json');
await writeFile(
  overlay,
  JSON.stringify({
    app: { baseUrl: baseURL },
    backend: {
      baseUrl: baseURL,
      listen: { host: '127.0.0.1', port },
      cors: { origin: baseURL },
      database: {
        connection: { directory: join(output, 'databases') },
        plugin: {
          operations: {
            connection: { filename: 'journal.sqlite' },
          },
        },
      },
    },
    opsCompass: {
      connections: { testing: { enabled: false } },
      ...(!features && {
        features: { defaults: { connections: true, inventory: true } },
      }),
    },
  }),
);
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !/^AWS_|^OPENAI_|^AUTH_GITLAB_|^OPS_COMPASS_|^APP_CONFIG_/i.test(key),
  ),
);
Object.assign(env, {
  NODE_ENV: 'development',
  NODE_OPTIONS: '--max-old-space-size=1536',
  PLAYWRIGHT_URL: baseURL,
  PLAYWRIGHT_SKIP_WEBSERVER: '1',
  PLAYWRIGHT_EXPECT_MODE: demo ? 'demo' : 'unconfigured',
  PLAYWRIGHT_CONNECTION_WRITES: '1',
  PLAYWRIGHT_FEATURE_WRITES: features ? '1' : '',
  ...(features && capture && { PLAYWRIGHT_FEATURE_CAPTURE_DIR: output }),
});
const configs = [
  '--config',
  join(root, 'app-config.yaml'),
  ...(demo ? ['--config', join(root, 'app-config.demo.yaml')] : []),
  '--config',
  overlay,
];
const log = createWriteStream(join(output, 'backend.log'));
const backend = spawn(
  process.execPath,
  [
    '--require',
    join(root, 'node_modules/@backstage/cli-node/config/nodeTransform.cjs'),
    'src/index.ts',
    ...configs,
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
let tests;
const watchdog = setTimeout(() => {
  tests?.kill();
  backend.kill();
}, 300000);
try {
  const deadline = Date.now() + 180000;
  let ready = false;
  while (Date.now() < deadline && backend.exitCode === null) {
    try {
      ready = (
        await fetch(`${baseURL}/.backstage/health/v1/readiness`, {
          signal: AbortSignal.timeout(2000),
        })
      ).ok;
    } catch {
      /* wait for local startup */
    }
    if (ready) break;
    await delay(1000);
  }
  if (!ready)
    throw new Error(`Isolated backend did not become ready. Inspect ${output}`);
  if (capture && !features) {
    tests = spawn(
      process.execPath,
      [join(root, 'scripts/capture-saved-connections.mjs'), baseURL],
      {
        cwd: root,
        env: { ...env, OPS_COMPASS_CAPTURE_ISOLATED: '1' },
        windowsHide: true,
        stdio: 'inherit',
      },
    );
    const [captureCode] = await once(tests, 'exit');
    if (captureCode !== 0) throw new Error('Isolated gallery capture failed.');
  }
  console.log(
    `Testing ${demo ? 'demo' : 'main'} ${
      features ? 'startup and feature settings' : 'connections'
    } with a fresh private journal.`,
  );
  tests = spawn(
    process.execPath,
    [
      join(root, 'node_modules/@playwright/test/cli.js'),
      'test',
      '--project=app-chromium',
      ...(features
        ? ['app.test.ts', 'features.test.ts']
        : ['connections.test.ts', 'inventory.test.ts']),
    ],
    { cwd: root, env, windowsHide: true, stdio: 'inherit' },
  );
  const [code] = await once(tests, 'exit');
  if (code !== 0) throw new Error('Isolated browser verification failed.');
  await writeFile(
    join(output, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        mode: demo ? 'demo' : 'main',
        realConnectionAttempted: false,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`Evidence retained in ${output}`);
} finally {
  clearTimeout(watchdog);
  if (tests && tests.exitCode === null) tests.kill();
  if (backend.exitCode === null) {
    backend.kill();
    await Promise.race([once(backend, 'exit'), delay(10000)]);
  }
  log.end();
}
