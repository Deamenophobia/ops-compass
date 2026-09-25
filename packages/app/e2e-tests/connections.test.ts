import { readFile } from 'node:fs/promises';
import { test, expect, Page } from '@playwright/test';

test('saved profiles persist, edit safely and keep manual tests separate from collection', async ({
  page,
}) => {
  test.skip(
    !process.env.PLAYWRIGHT_CONNECTION_WRITES,
    'Run through scripts/test-connections.mjs with an isolated journal.',
  );
  await open(page);
  const name = `Synthetic connection ${Date.now()}`;
  await page
    .getByLabel('Expected AWS account ID', { exact: true })
    .fill('000000000000');
  await page.getByLabel('AWS regions', { exact: true }).fill('eu-west-1');
  await page
    .getByLabel('AWS profile (optional)', { exact: true })
    .fill('sample-sso');
  await page
    .getByLabel('Snapshot directory on portal backend', { exact: true })
    .fill('/private');
  await page
    .getByRole('button', { name: 'Prepare setup', exact: true })
    .click();
  await page.getByLabel('Connection name', { exact: true }).fill(name);
  await page
    .getByLabel('Connection environment', { exact: true })
    .fill('simulation');
  await page
    .getByRole('button', { name: 'Save new connection', exact: true })
    .click();
  let card = page.getByRole('group', {
    name: `Saved connection ${name}`,
    exact: true,
  });
  await expect(card).toContainText('Not tested');
  await page.reload();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await expect(
    page.getByLabel('Expected AWS account ID', { exact: true }),
  ).toHaveValue('000000000000');
  const demo = process.env.PLAYWRIGHT_EXPECT_MODE === 'demo';
  if (demo) {
    await card
      .getByRole('button', { name: 'Test connection', exact: true })
      .click();
    await expect(card).toContainText('Simulated · Access verified');
    await expect(card).toContainText('No cloud or SSH request was sent.');
  } else {
    await expect(
      card.getByRole('button', { name: 'Test connection', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText('Live tests are disabled.', { exact: false }),
    ).toBeVisible();
  }
  await card
    .getByRole('button', { name: 'Disable profile', exact: true })
    .click();
  await expect(
    card.getByRole('button', { name: 'Test connection', exact: true }),
  ).toBeDisabled();
  await expect(card).not.toContainText('Access verified');
  await expect(
    page.getByLabel('Enable manual tests', { exact: true }),
  ).not.toBeChecked();
  await card
    .getByRole('button', { name: 'Enable profile', exact: true })
    .click();
  await expect(card).toContainText('Not tested');
  await expect(
    page.getByLabel('Enable manual tests', { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('heading', {
      name: `Editing ${name} · revision 3`,
      exact: true,
    }),
  ).toBeVisible();
  await card.getByRole('button', { name: 'Edit profile', exact: true }).click();
  const renamed = `${name} edited`;
  await page.getByLabel('Connection name', { exact: true }).fill(renamed);
  await page
    .getByRole('button', { name: 'Update saved connection', exact: true })
    .click();
  card = page.getByRole('group', {
    name: `Saved connection ${renamed}`,
    exact: true,
  });
  await expect(card).toBeVisible();
  if (demo) {
    await page.getByLabel('Simulation result', { exact: true }).click();
    await page
      .getByRole('option', { name: 'Access denied', exact: true })
      .click();
    await card
      .getByRole('button', { name: 'Test connection', exact: true })
      .click();
    await expect(card).toContainText('Simulated · Test failed');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.route('**/api/operations/connections', route =>
    route.abort('failed'),
  );
  await page
    .getByRole('button', { name: 'Refresh saved connections', exact: true })
    .click();
  await expect(card).toHaveCount(0);
});

async function open(page: Page) {
  await page.goto('/connections');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(
    page.getByText('Drafting makes no connection', { exact: true }),
  ).toBeVisible();
}
async function downloaded(page: Page, button: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const file = await pending;
  return {
    filename: file.suggestedFilename(),
    content: JSON.parse(await readFile((await file.path())!, 'utf8')),
  };
}

test('AWS setup starts blank, exports references and clears the draft after editing', async ({
  page,
}) => {
  await open(page);
  await expect(
    page.getByLabel('Expected AWS account ID', { exact: true }),
  ).toHaveValue('');
  await page
    .getByRole('button', { name: 'Prepare setup', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Please correct');
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
  expect(await downloaded(page, 'Download collector configuration')).toEqual({
    filename: 'aws-inventory.local.json',
    content: {
      expectedAccountId: '000000000000',
      regions: ['eu-west-1', 'us-east-1'],
      profile: 'sample-sso',
      serviceMappings: {},
    },
  });
  const portal = await downloaded(page, 'Download portal configuration');
  expect(portal.filename).toBe('app-config.connections.local.yaml');
  expect(portal.content.opsCompass.inventory.file).toBe(
    '/srv/ops-compass/private/inventory.local.json',
  );
  await page.getByLabel('AWS regions', { exact: true }).fill('eu-west-2');
  await expect(
    page.getByRole('button', { name: 'Download collector configuration' }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByLabel('Expected AWS account ID', { exact: true }),
  ).toHaveValue('');
});

test('SSH setup validates multiple hosts and works on a small screen', async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole('button', { name: 'Linux servers over SSH', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add server', exact: true }).click();
  for (const number of [1, 2]) {
    const host = page.getByRole('group', {
      name: `Server ${number}`,
      exact: true,
    });
    await host
      .getByLabel('Server ID', { exact: true })
      .fill(`sample-${number}`);
    await host
      .getByLabel('SSH alias', { exact: true })
      .fill(`sample-host-${number}`);
    await host
      .getByLabel('Display name', { exact: true })
      .fill(`Sample server ${number}`);
    await host
      .getByLabel('Catalog entity reference', { exact: true })
      .fill(`resource:default/sample-${number}`);
    await host.getByLabel('Environment', { exact: true }).fill('sandbox');
    await host
      .getByLabel('Region or location', { exact: true })
      .fill('sample-location');
  }
  await page
    .getByLabel('Snapshot directory on portal backend', { exact: true })
    .fill('C:\\portal\\private');
  await page
    .getByRole('group', { name: 'Server 2', exact: true })
    .getByLabel('Server ID', { exact: true })
    .fill('sample-1');
  await page
    .getByRole('button', { name: 'Prepare setup', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('unique ID');
  await page
    .getByRole('group', { name: 'Server 2', exact: true })
    .getByLabel('Server ID', { exact: true })
    .fill('sample-2');
  await page
    .getByRole('button', { name: 'Prepare setup', exact: true })
    .click();
  const hosts = await downloaded(page, 'Download collector configuration');
  expect(hosts.content.targets).toHaveLength(2);
  expect(hosts.content.targets[1].sshAlias).toBe('sample-host-2');
  const portal = await downloaded(page, 'Download portal configuration');
  expect(portal.content.opsCompass.snapshotFile).toBe(
    'C:/portal/private/observations.local.json',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
