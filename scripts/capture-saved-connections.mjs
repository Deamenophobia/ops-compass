// Called by the isolated harness before browser tests. Never use an existing journal.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { captureConnections } from './capture-connections.mjs';

assert.equal(process.env.OPS_COMPASS_CAPTURE_ISOLATED, '1');
const baseURL = process.argv[2];
const endpoint = new URL(baseURL);
assert.equal(endpoint.hostname, '127.0.0.1');
assert.equal(endpoint.protocol, 'http:');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../docs/screenshots/', import.meta.url);
const metadata = JSON.parse(
  await readFile(new URL('capture.json', output), 'utf8'),
);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
    locale: 'en-GB',
    timezoneId: 'Asia/Singapore',
  });
  await page.route('**/*', route =>
    new URL(route.request().url()).origin === endpoint.origin
      ? route.continue()
      : route.abort(),
  );
  await page.goto(`${baseURL}/connections`);
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(
    page.getByText('Demo tests · No network requests', { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const save = async (file, scenario, fullPage = false) => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: fileURLToPath(new URL(file, output)),
      fullPage,
      animations: 'disabled',
    });
    metadata.captures = metadata.captures.filter(item => item.file !== file);
    metadata.captures.push({
      file,
      scenario,
      capturedAt: new Date().toISOString(),
      applicationRevision: revision,
      source: 'isolated-synthetic-connections',
      connectionAttempted: false,
    });
  };
  await captureConnections(page, save, baseURL);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page
    .getByRole('button', { name: 'New connection', exact: true })
    .click();
  await page
    .getByLabel('Expected AWS account ID', { exact: true })
    .fill('000000000000');
  await page
    .getByLabel('AWS regions', { exact: true })
    .fill('eu-west-1, us-east-1');
  await page
    .getByLabel('AWS profile (optional)', { exact: true })
    .fill('sample-sso');
  await page
    .getByLabel('Snapshot directory on portal backend', { exact: true })
    .fill('/srv/ops-compass/private');
  await page
    .getByRole('button', { name: 'Prepare setup', exact: true })
    .click();
  await page
    .getByLabel('Connection name', { exact: true })
    .fill('Sample AWS workspace');
  await page
    .getByLabel('Connection environment', { exact: true })
    .fill('sandbox');
  await page
    .getByRole('button', { name: 'Save new connection', exact: true })
    .click();
  const card = page.getByRole('group', {
    name: 'Saved connection Sample AWS workspace',
    exact: true,
  });
  await expect(card).toContainText('Not tested');
  await card
    .getByRole('button', { name: 'Test connection', exact: true })
    .click();
  await expect(card).toContainText('Simulated · Access verified');
  const showSavedSection = () =>
    page
      .getByRole('heading', { name: 'Saved connections', exact: true })
      .locator('..')
      .locator('..')
      .evaluate(element => element.scrollIntoView({ block: 'start' }));
  await showSavedSection();
  await save(
    '34-saved-connection-test.png',
    'Saved synthetic AWS profile with simulated access checks; no cloud request',
  );
  await card
    .getByRole('button', { name: 'Disable profile', exact: true })
    .click();
  await expect(card).toContainText('Disabled');
  await expect(
    card.getByRole('button', { name: 'Test connection', exact: true }),
  ).toBeDisabled();
  await expect(card).not.toContainText('Access verified');
  await showSavedSection();
  await save(
    '36-disabled-connection.png',
    'Disabled synthetic profile blocks further tests and clears earlier verification',
  );
  await card
    .getByRole('button', { name: 'Enable profile', exact: true })
    .click();
  await page.getByLabel('Simulation result', { exact: true }).click();
  await page
    .getByRole('option', { name: 'Access denied', exact: true })
    .click();
  await card
    .getByRole('button', { name: 'Test connection', exact: true })
    .click();
  await expect(card).toContainText('Simulated · Test failed');
  await showSavedSection();
  await save(
    '35-denied-connection.png',
    'Simulated AWS access denial with no success claim or real request',
  );
  await writeFile(
    new URL('capture.json', output),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  console.log(
    'Captured six connection scenarios using only an isolated synthetic journal.',
  );
} finally {
  await browser.close();
}
