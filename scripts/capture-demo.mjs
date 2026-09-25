// Copy to scripts/capture-demo.mjs on demo. Use a fresh private demo database.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { captureAdditions } from './capture-additions.mjs';
import { captureConnections } from './capture-connections.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../docs/screenshots/', import.meta.url);
const fixture = await readFile(
  new URL('../demo/observations.json', import.meta.url),
);
const data = JSON.parse(fixture);
assert.equal(data.source, 'demo');
const baseURL = 'http://localhost:7007';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const captures = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1500 },
    locale: 'en-GB',
    timezoneId: 'Asia/Singapore',
  });
  page.setDefaultTimeout(30000);
  const response = page.waitForResponse(
    r => r.url() === `${baseURL}/api/operations/overview` && r.ok(),
  );
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  const overview = await (await response).json();
  assert.equal(overview.source, 'demo', 'Refusing to capture real evidence');
  assert.equal(overview.mode, 'demo');
  const derived = data.services.flatMap(s => [
    ...s.containers.map((_, i) => `${s.id}-container-${i}`),
    ...(s.heartbeat ? [`${s.id}-heartbeat`] : []),
    ...(s.certificate ? [`${s.id}-certificate`] : []),
  ]);
  assert.deepEqual(
    overview.observations.map(o => o.id).sort(),
    [...data.observations.map(o => o.id), ...derived].sort(),
  );
  for (const expected of data.observations) {
    const actual = overview.observations.find(o => o.id === expected.id);
    for (const key of [
      'entityRef',
      'label',
      'environment',
      'region',
      'summary',
    ])
      assert.equal(actual[key], expected[key]);
  }
  await mkdir(output, { recursive: true });
  async function save(file, scenario, fullPage = true) {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: fileURLToPath(new URL(file, output)),
      fullPage,
      animations: 'disabled',
    });
    captures.push({ file, scenario });
  }
  async function tab(name) {
    await page.getByRole('tab', { name, exact: true }).click();
  }
  async function scenario(name) {
    await page.locator('#ops-demo-scenario').click();
    await page.getByRole('option', { name, exact: true }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(page.getByText('Demo scenario changed.')).toBeVisible();
  }
  await expect(
    page.getByRole('heading', { name: 'Gateway readiness' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 2800 });
  await save(
    '01-operations.png',
    'Synthetic overview with container, heartbeat and certificate checks',
  );
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.getByLabel('Status', { exact: true }).click();
  await page.getByRole('option', { name: 'Needs attention' }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByLabel('Find a check or service').fill('disk');
  await page.getByLabel('View name', { exact: true }).fill('Disk review');
  await page.getByRole('button', { name: 'Save current view' }).click();
  await expect(
    page.getByRole('heading', { name: 'Root disk capacity' }),
  ).toBeVisible();
  await save(
    '02-needs-attention.png',
    'Search, attention filter and a browser-saved Disk review view',
  );

  const workspaceResponse = page.waitForResponse(
    r => r.url().endsWith('/api/operations/workspace') && r.ok(),
  );
  const docsResponse = page.waitForResponse(
    r => r.url().endsWith('/api/operations/documents') && r.ok(),
  );
  const notificationsResponse = page.waitForResponse(
    r => r.url().endsWith('/api/operations/notifications') && r.ok(),
  );
  await page.goto(`${baseURL}/workspace`);
  const workspace = await (await workspaceResponse).json();
  assert.equal(workspace.source, 'demo');
  assert.equal(workspace.activeScenario, 'disk-pressure');
  assert.deepEqual(
    workspace.services.map(s => ({
      id: s.id,
      host: s.host,
      containers: s.containers.map(c => ({
        name: c.name,
        image: c.image,
        revision: c.revision,
      })),
    })),
    data.services.map(s => ({
      id: s.id,
      host: s.host,
      containers: s.containers.map(c => ({
        name: c.name,
        image: c.image,
        revision: c.revision,
      })),
    })),
  );
  assert.equal(
    (await (await docsResponse).json()).items.length,
    0,
    'Use an empty private demo database to avoid capturing earlier user records',
  );
  const notifications = await (await notificationsResponse).json();
  assert.equal(notifications.settings.recipient, '');
  assert.equal(notifications.settings.sender, '');
  assert.equal(notifications.attempts.length, 0);
  assert.equal(workspace.costs.preference, undefined);
  await expect(
    page.getByText('Version difference:', { exact: false }),
  ).toBeVisible();
  await save(
    '09-service-workspace.png',
    'Gateway containers, image/revision, health, restarts, heartbeat and pipeline difference',
  );
  await page.locator('#ops-service').click();
  await page
    .getByRole('option', { name: 'Market data worker', exact: true })
    .click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(
    page.getByRole('cell', { name: 'signal-worker', exact: true }),
  ).toBeVisible();
  await save(
    '10-worker-containers.png',
    'Three synthetic worker containers and a separate heartbeat',
  );
  await page.locator('#ops-service').click();
  await page.getByRole('option', { name: 'API Gateway', exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);

  await scenario('Unhealthy container');
  await expect(
    page.getByRole('cell', { name: /running \/ failing/ }),
  ).toBeVisible();
  await save(
    '19-unhealthy-container.png',
    'Running gateway with failing health and seven restarts',
  );
  await tab('history');
  await page.getByLabel('Event type', { exact: true }).click();
  await page.getByRole('option', { name: 'health', exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByLabel('Filter service', { exact: true }).click();
  await page.getByRole('option', { name: 'API Gateway', exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page
    .getByLabel(/^Select event /)
    .first()
    .check();
  await save(
    '11-operations-history.png',
    'Persistent gateway health events with recording and observation times',
  );
  await page
    .getByRole('button', { name: 'Draft worklog from selection' })
    .click();
  await expect(page.getByLabel('Worklog Markdown')).toHaveValue(/Not supplied/);
  await page.getByLabel('Worklog title').fill('Demo: gateway health review');
  const draft = await page.getByLabel('Worklog Markdown').inputValue();
  await page
    .getByLabel('Worklog Markdown')
    .fill(
      draft.replace('# Operations worklog', '# Demo: gateway health review') +
        '\n\n## Review note\n\nSynthetic walkthrough: selected the unhealthy-container scenario and reviewed the observed transition. No workload was restarted.',
    );
  await page.getByRole('button', { name: 'Save reviewed worklog' }).click();
  await expect(
    page.getByText('Worklog saved to private storage.'),
  ).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown' }).first().click();
  assert.match((await downloaded).suggestedFilename(), /\.md$/);
  await save(
    '12-reviewed-worklog.png',
    'Cited deterministic draft, review field, saved record and Markdown export',
  );
  await tab('notifications');
  await expect(page.getByLabel('Recipient email')).toHaveValue('');
  await save(
    '13-email-configuration.png',
    'Blank user-configured email fields with backend-only provider credentials',
  );
  await page.getByRole('button', { name: 'Simulate email test' }).click();
  await expect(
    page.getByText('Test queued for simulation. No email will be sent.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Background delivery queue' }),
  ).toBeVisible();
  await save(
    '24-delivery-queue.png',
    'Persistent notification queue with worker progress and a recovery guide',
  );
  await page
    .getByRole('button', { name: 'Simulate receipt confirmation' })
    .click();
  await expect(
    page.getByText('Simulated receipt:', { exact: false }),
  ).toBeVisible();
  await save(
    '14-email-receipt.png',
    'Simulation and receipt attestation; no real email was sent',
  );
  await tab('costs');
  await page.getByLabel('Monthly budget amount').fill('60');
  await page.getByRole('button', { name: 'Save planning budget' }).click();
  await expect(page.getByText('Local planning budget saved.')).toBeVisible();
  await save(
    '15-aws-costs.png',
    'Synthetic AWS budget, forecast overrun and a private planning preference',
  );
  await tab('maintenance');
  await page.setViewportSize({ width: 1440, height: 2000 });
  await expect(
    page.getByText('portal.example.com', { exact: false }),
  ).toBeVisible();
  await save(
    '16-certificate-reminders.png',
    'TLS expiry with missing backup verification explicitly unclaimed',
  );
  const localDate = value =>
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(value)
      .replace(' ', 'T');
  await page
    .getByLabel('Verified at', { exact: true })
    .fill(localDate(new Date(Date.now() - 3600000)));
  await page
    .getByLabel('Next verification due')
    .fill(localDate(new Date(Date.now() + 7 * 86400000)));
  await page
    .getByLabel('Backup verification evidence')
    .fill(
      'Synthetic example: an isolated restore report was reviewed. This walkthrough did not execute a real backup or restore.',
    );
  await page
    .getByRole('button', { name: 'Record verification', exact: true })
    .click();
  await expect(page.getByText('Backup verification recorded.')).toBeVisible();
  await save(
    '17-backup-verification.png',
    'User-attested verification evidence and next due date',
  );
  await page
    .getByLabel('Maintenance note', { exact: true })
    .fill(
      'Synthetic maintenance plan: review retention for the demo host, renew the example certificate, and compare image revisions before the next release. No infrastructure changes performed.',
    );
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Maintenance note saved.')).toBeVisible();
  await page
    .getByText('Maintenance notes', { exact: true })
    .scrollIntoViewIfNeeded();
  await save(
    '18-maintenance-notes.png',
    'Service-specific note with author and saved timestamp',
  );

  await tab('services');
  await page.setViewportSize({ width: 1440, height: 1500 });
  await scenario('Expired worker heartbeat');
  await page.locator('#ops-service').click();
  await page
    .getByRole('option', { name: 'Market data worker', exact: true })
    .click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByText('Unknown · no recent heartbeat')).toBeVisible();
  await save(
    '20-expired-heartbeat.png',
    'Worker containers passing while its separate heartbeat is expired',
  );
  await scenario('Normal operation');
  await page.locator('#ops-service').click();
  await page.getByRole('option', { name: 'API Gateway', exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(
    page.getByText('Runtime commits match the latest pipeline commit.'),
  ).toBeVisible();
  await save(
    '21-normal-scenario.png',
    'Healthy synthetic baseline and matching pipeline/runtime commits',
  );
  await scenario('Disconnected collector');
  await expect(
    page.getByText(
      'Observation source unavailable. Current service details have been cleared;',
      { exact: false },
    ),
  ).toBeVisible();
  await save(
    '05-source-unavailable.png',
    'Disconnected scenario clears current services while keeping scenario recovery available',
  );
  await scenario('Disk pressure');

  await page.goto(`${baseURL}/catalog/default/component/api-gateway`);
  await expect(
    page.getByText(
      'Reference Spring Cloud entry point. Runtime demo data is synthetic.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'catalog-service', exact: true }).first(),
  ).toBeVisible();
  await save(
    '03-service-relations.png',
    'Catalog ownership, dependencies and reference source',
  );
  await page.setViewportSize({ width: 1440, height: 2100 });
  await page.goto(`${baseURL}/agent`);
  await page.getByLabel('Purpose').click();
  await page.getByRole('option', { name: 'Draft a worklog' }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Generate preview' }).click();
  await expect(page.getByLabel('Agent context JSON')).toContainText(
    '"source": "demo"',
  );
  await save(
    '04-agent-worklog.png',
    'Read-only MCP tool list and cited evidence context',
  );
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto(
    `${baseURL}/docs/default/component/ops-compass/runbooks/health`,
  );
  await expect(
    page.getByText(
      'A warning/critical check, unknown result, source error, or unexpected gap in collection.',
    ),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.locator('html.no-js')).toHaveCSS('opacity', '1');
  await save(
    '06-health-runbook.png',
    'Rendered health runbook with unknown-evidence procedures',
  );
  await page.goto(
    `${baseURL}/docs/default/component/ops-compass/guides/user-manual`,
  );
  await expect(
    page.getByText(
      'Running describes a process; passing describes its configured health check.',
      { exact: false },
    ),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.locator('html.no-js')).toHaveCSS('opacity', '1');
  await save(
    '22-user-manual.png',
    'Searchable TechDocs manual for every feature',
    false,
  );
  await page.goto(
    `${baseURL}/docs/default/component/ops-compass/guides/storage-and-delivery`,
  );
  await expect(
    page.getByRole('heading', {
      name: /^Database upgrades and background delivery/,
    }),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.locator('html.no-js')).toHaveCSS('opacity', '1');
  await save(
    '25-storage-recovery.png',
    'Versioned database upgrade instructions and delivery recovery manual',
    false,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL);
  await expect(page.getByText('Demo workspace', { exact: true })).toBeVisible();
  assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth));
  await save('07-mobile.png', '390px mobile operations overview', false);
  await page.goto(`${baseURL}/workspace`);
  await expect(page.getByText('Demo workspace', { exact: true })).toBeVisible();
  await page
    .getByText('Individual containers', { exact: true })
    .scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth));
  await save(
    '23-mobile-workspace.png',
    '390px mobile service details with an internally scrolling container table',
    false,
  );
  await captureAdditions(page, save);
  await captureConnections(page, save);
  await writeFile(
    new URL('capture.json', output),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        baseURL,
        source: 'demo',
        applicationRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: root,
          encoding: 'utf8',
        }).trim(),
        fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
        captures,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Saved ${captures.length} synthetic screenshots to docs/screenshots.`,
  );
} finally {
  await browser.close();
}
