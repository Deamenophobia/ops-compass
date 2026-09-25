// Only synthetic form values are entered. No files are installed and no collector runs.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../docs/screenshots/', import.meta.url);

export async function captureConnections(
  page,
  save,
  baseURL = 'http://localhost:7007',
) {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${baseURL}/connections`);
  // Never publish saved profiles from a user's existing journal.
  await expect(
    page.getByText('Demo tests · No network requests', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('No saved connections.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('group', { name: /^Saved connection / }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel('Expected AWS account ID', { exact: true }),
  ).toHaveValue('');
  await save(
    '31-connections.png',
    'Blank reusable connection setup; no author-owned account or host',
    true,
  );
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
  await expect(
    page.getByRole('button', { name: 'Download collector configuration' }),
  ).toBeVisible();
  await page
    .getByRole('heading', { name: '3. Review and download', exact: true })
    .locator('..')
    .scrollIntoViewIfNeeded();
  await save(
    '32-aws-connection-draft.png',
    'Synthetic AWS configuration export; not installed or connected',
    false,
  );
  await page
    .getByRole('button', { name: 'Linux servers over SSH', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add server', exact: true }).click();
  for (const number of [1, 2]) {
    const group = page.getByRole('group', {
      name: `Server ${number}`,
      exact: true,
    });
    for (const [label, value] of [
      ['Server ID', `sample-${number}`],
      ['SSH alias', `sample-host-${number}`],
      ['Display name', `Sample server ${number}`],
      ['Catalog entity reference', `resource:default/sample-${number}`],
      ['Environment', 'sandbox'],
      ['Region or location', 'sample-location'],
    ])
      await group.getByLabel(label, { exact: true }).fill(value);
  }
  await page
    .getByRole('button', { name: 'Prepare setup', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Download portal configuration' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page
    .getByRole('heading', { name: '2. Describe your connection', exact: true })
    .locator('..')
    .scrollIntoViewIfNeeded();
  await save(
    '33-ssh-connection-draft.png',
    'Two synthetic Linux SSH targets; no SSH connection attempted',
    false,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({
      locale: 'en-GB',
      timezoneId: 'Asia/Singapore',
    });
    await page.goto('http://localhost:7007/');
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(
      page.getByText('Demo workspace', { exact: true }),
    ).toBeVisible();
    const metadata = JSON.parse(
      await readFile(new URL('capture.json', output), 'utf8'),
    );
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    await captureConnections(page, async (file, scenario, fullPage) => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: fileURLToPath(new URL(file, output)),
        fullPage,
        animations: 'disabled',
      });
      metadata.captures = metadata.captures.filter(c => c.file !== file);
      metadata.captures.push({
        file,
        scenario,
        capturedAt: new Date().toISOString(),
        applicationRevision: revision,
        source: 'synthetic-connection-form',
        connectionAttempted: false,
      });
    });
    await writeFile(
      new URL('capture.json', output),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    console.log(
      'Saved three synthetic connection screenshots; no collection or configuration installation.',
    );
  } finally {
    await browser.close();
  }
}
