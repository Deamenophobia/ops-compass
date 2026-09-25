// These read-only captures can extend the gallery without resetting its demo journal.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../docs/screenshots/', import.meta.url);
const fixture = await readFile(
  new URL('../demo/inventory.json', import.meta.url),
);
const expected = JSON.parse(fixture);

export async function captureAdditions(page, save) {
  assert.equal(expected.source, 'demo');
  const response = page.waitForResponse(
    r => r.url().endsWith('/api/operations/inventory') && r.ok(),
  );
  await page.goto('http://localhost:7007/inventory');
  const data = await (await response).json();
  assert.equal(data.source, 'demo', 'Refusing to capture real inventory');
  // Compare every identity field; the demo backend only replays timestamps/freshness.
  const stable = ({ observedAt, freshness, ...identity }) => identity;
  assert.deepEqual(data.instances.map(stable), expected.instances.map(stable));
  assert.deepEqual(data.coverage, expected.coverage);
  await expect(
    page.getByText('Synthetic AWS inventory', { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await save(
    '26-aws-inventory.png',
    'Synthetic EC2 identities, partial coverage and service mappings',
    false,
  );
  for (const [slug, heading, file, description] of [
    [
      'production-setup',
      'Private daily-use deployment',
      '27-production-setup.png',
      'GitLab identity and persistent storage setup manual; not a live OAuth result',
    ],
    [
      'sandbox-delivery',
      'Sandbox deployment and rollback',
      '28-sandbox-delivery.png',
      'Immutable-image sandbox deployment, rollback and AWS transport manual',
    ],
    [
      'ai-client',
      'Model client and evidence checks',
      '29-model-client.png',
      'External MCP model client setup and evidence-gate evaluation manual',
    ],
  ]) {
    await page.goto(
      `http://localhost:7007/docs/default/component/ops-compass/guides/${slug}`,
    );
    await expect(
      page.getByRole('heading', { name: new RegExp(`^${heading}`) }),
    ).toBeVisible({ timeout: 90000 });
    await expect(page.locator('html.no-js')).toHaveCSS('opacity', '1');
    await save(file, description, false);
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
      locale: 'en-GB',
      timezoneId: 'Asia/Singapore',
    });
    await page.goto('http://localhost:7007/agent');
    await page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Generate preview' }),
    ).toBeVisible();
    const metadata = JSON.parse(
      await readFile(new URL('capture.json', output), 'utf8'),
    );
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    await captureAdditions(page, async (file, scenario, fullPage) => {
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
        inventoryFixtureSha256: createHash('sha256')
          .update(fixture)
          .digest('hex'),
      });
    });
    await writeFile(
      new URL('capture.json', output),
      JSON.stringify(metadata, null, 2) + '\n',
    );
    console.log(
      'Saved four checked demo/manual screenshots; existing journal and captures preserved.',
    );
  } finally {
    await browser.close();
  }
}
