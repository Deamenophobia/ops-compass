import { test, expect } from '@playwright/test';

const isDemo = process.env.PLAYWRIGHT_EXPECT_MODE === 'demo';

test('mobile container details scroll within their panel', async ({ page }) => {
  test.skip(!isDemo, 'Runtime examples live only on demo.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workspace');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  const table = page.getByRole('region', { name: 'Container observations' });
  await expect(table).toBeVisible();
  await table.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(await table.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(
    true,
  );
  await table.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => table.evaluate(el => el.scrollLeft))
    .toBeGreaterThan(0);
});

test('workspace keeps unconfigured email and spending explicit', async ({
  page,
}) => {
  test.skip(isDemo, 'The demo branch has a separate synthetic walkthrough.');
  await page.goto('/workspace');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(
    page.getByText('Your workspace is ready to connect'),
  ).toBeVisible();
  await expect(
    page.getByText('Connect a service to see its containers'),
  ).toBeVisible();
  await expect(page.getByLabel('Demo scenario')).toHaveCount(0);
  await page.getByRole('tab', { name: 'notifications', exact: true }).click();
  await expect(page.getByLabel('Recipient email')).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Send test email' }),
  ).toBeDisabled();
  await page.getByRole('tab', { name: 'costs', exact: true }).click();
  await expect(page.getByLabel('Monthly budget amount')).toHaveValue('');
  await expect(
    page.getByText('Connect a named monthly AWS cost budget', { exact: false }),
  ).toBeVisible();
});

test('workspace records reviewed evidence and handles demo failures', async ({
  page,
}) => {
  test.skip(!isDemo, 'Runtime examples live only on demo.');
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1300 });
  await page.goto('/workspace');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(page.getByText('Demo workspace', { exact: true })).toBeVisible();
  await expect(page.getByText('Pipeline and deployed version')).toBeVisible();
  await expect(page.getByText('Heartbeat current')).toBeVisible();
  await page.getByLabel('Demo scenario').click();
  await page
    .getByRole('option', { name: 'Unhealthy container', exact: true })
    .click();
  await expect(page.getByText('Demo scenario changed.')).toBeVisible();
  await expect(
    page.getByRole('cell', { name: /running \/ failing/ }),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'history', exact: true }).click();
  await page
    .getByLabel(/^Select event /)
    .first()
    .check();
  await page
    .getByRole('button', { name: 'Draft worklog from selection' })
    .click();
  await expect(page.getByLabel('Worklog Markdown')).toHaveValue(/Not supplied/);
  const worklogTitle = `Demo walkthrough ${Date.now()}`;
  await page.getByLabel('Worklog title').fill(worklogTitle);
  const draft = await page.getByLabel('Worklog Markdown').inputValue();
  await page
    .getByLabel('Worklog Markdown')
    .fill(
      `${draft}\n\nReview: synthetic scenario exercised through the portal. No runtime command performed.`,
    );
  await page.getByRole('button', { name: 'Save reviewed worklog' }).click();
  await expect(
    page.getByText('Worklog saved to private storage.'),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Markdown' }).first().click();
  expect((await download).suggestedFilename()).toMatch(/\.md$/);
  await page.reload();
  await expect(page.getByText(worklogTitle, { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: 'notifications', exact: true }).click();
  await expect(page.getByLabel('Recipient email')).toHaveValue('');
  await page.getByRole('button', { name: 'Simulate email test' }).click();
  await expect(
    page.getByText('Test queued for simulation. No email will be sent.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Background delivery queue' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Simulate receipt confirmation' })
    .first()
    .click();
  await expect(
    page.getByText('Simulated receipt:', { exact: false }).first(),
  ).toBeVisible();

  await page.getByRole('tab', { name: 'costs', exact: true }).click();
  await expect(
    page.getByText('Actual: 42.50 USD', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('Monthly budget amount').fill('60');
  await page.getByRole('button', { name: 'Save planning budget' }).click();
  await expect(page.getByText('Local planning budget saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Monthly budget amount')).toHaveValue('60');

  await page.getByRole('tab', { name: 'maintenance', exact: true }).click();
  const localDate = (value: Date) =>
    new Date(value.getTime() - value.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  await page
    .getByLabel('Verified at', { exact: true })
    .fill(localDate(new Date(Date.now() - 3600000)));
  await page
    .getByLabel('Next verification due')
    .fill(localDate(new Date(Date.now() + 7 * 86400000)));
  await page
    .getByLabel('Backup verification evidence')
    .fill(
      'Synthetic walkthrough: example restore report reviewed. No real backup or restore was executed.',
    );
  await page
    .getByRole('button', { name: 'Record verification', exact: true })
    .click();
  await expect(page.getByText('Backup verification recorded.')).toBeVisible();
  const note = `Synthetic maintenance note ${Date.now()}: review disk retention before the next release.`;
  await page.getByLabel('Maintenance note', { exact: true }).fill(note);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText(note, { exact: false }).last()).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('Next verification scheduled', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(note, { exact: false }).last()).toBeVisible();

  await page.getByLabel('Demo scenario').click();
  await page
    .getByRole('option', { name: 'Disconnected collector', exact: true })
    .click();
  await expect(
    page.getByText(
      'Observation source unavailable. Current service details have been cleared;',
      { exact: false },
    ),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'services', exact: true }).click();
  await expect(
    page.getByText('Connect a service to see its containers'),
  ).toBeVisible();
  await page.getByLabel('Demo scenario').click();
  await page
    .getByRole('option', { name: 'Disk pressure', exact: true })
    .click();
  await expect(page.getByText('Heartbeat current')).toBeVisible();

  await page.goto('/');
  await page.getByLabel('Find a check or service').fill('disk');
  await page.getByLabel('View name', { exact: true }).fill('Disk review');
  await page.getByRole('button', { name: 'Save current view' }).click();
  await page.reload();
  await page.getByLabel('Saved view', { exact: true }).click();
  await page.getByRole('option', { name: 'Disk review', exact: true }).click();
  await expect(page.getByLabel('Find a check or service')).toHaveValue('disk');
  await page.getByRole('button', { name: 'Delete saved view' }).click();
  await page.goto('/workspace');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Demo workspace', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
