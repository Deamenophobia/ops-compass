import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('feature choices persist, trim navigation, guard direct routes and keep only selected workspace tabs', async ({
  page,
}) => {
  test.skip(
    !process.env.PLAYWRIGHT_FEATURE_WRITES,
    'Use the isolated --features harness.',
  );
  await page.goto('/features');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Workspace features', exact: true }),
  ).toBeVisible();
  const save = async () => {
    await page
      .getByRole('button', { name: 'Save feature choices', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText(
      'Feature choices saved',
    );
  };
  const capture = async (name: string) => {
    if (process.env.PLAYWRIGHT_FEATURE_CAPTURE_DIR) {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: join(process.env.PLAYWRIGHT_FEATURE_CAPTURE_DIR, name),
        fullPage: false,
        animations: 'disabled',
      });
    }
  };
  await page.setViewportSize({ width: 1440, height: 1200 });
  await expect(
    page.getByRole('switch', { name: 'Cloud connections', exact: true }),
  ).toBeVisible();
  if (process.env.PLAYWRIGHT_EXPECT_MODE !== 'demo') {
    await expect(
      page.getByText('0 of 9 optional modules selected'),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: 'Minimal', exact: true }).click();
  await save();
  await expect(
    page.getByRole('link', { name: 'Connections', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Agent access', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Workspace', exact: true }),
  ).toHaveCount(0);
  await capture('37-minimal-features.png');
  await page.reload();
  await expect(
    page.getByText('0 of 9 optional modules selected'),
  ).toBeVisible();
  await page.goto('/connections');
  await expect(
    page.getByRole('heading', { name: 'Feature disabled', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Manage workspace features', exact: true })
    .click();
  await page
    .getByRole('switch', { name: 'Cloud connections', exact: true })
    .check();
  await expect(
    page.getByText('Unsaved choices.', { exact: false }),
  ).toBeVisible();
  // Reload discards staged choices instead of accidentally saving them.
  await page
    .getByRole('button', { name: 'Reload saved choices', exact: true })
    .click();
  await expect(
    page.getByRole('switch', { name: 'Cloud connections', exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByText('Unsaved choices.', { exact: false }),
  ).toHaveCount(0);
  await page
    .getByRole('switch', { name: 'Cloud connections', exact: true })
    .check();
  await page
    .getByRole('switch', { name: 'Cost tracking', exact: true })
    .check();
  await save();
  await expect(
    page.getByText('Unsaved choices.', { exact: false }),
  ).toHaveCount(0);
  await capture('38-selected-features.png');
  await page.goto('/workspace?tab=notifications');
  await expect(
    page.getByRole('tab', { name: 'costs', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(
    page.getByRole('tab', { name: 'notifications', exact: true }),
  ).toHaveCount(0);
  await capture('39-optional-workspace.png');
  await page.goto('/connections');
  await expect(
    page.getByText('Drafting makes no connection', { exact: true }),
  ).toBeVisible();
  await page.goto('/features');
  await page.getByRole('button', { name: 'Enable all', exact: true }).click();
  await save();
  await page.goto('/workspace');
  await expect(page.getByRole('tab')).toHaveCount(6);
  await page.goto('/features');
  await expect(
    page.getByRole('button', { name: 'Save feature choices', exact: true }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
  // A settings outage must hide optional navigation and prevent stale mounted pages.
  await page.route('**/api/operations/features', route =>
    route.abort('failed'),
  );
  await page
    .getByRole('button', { name: 'Reload saved choices', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Connections', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Save feature choices', exact: true }),
  ).toBeDisabled();
});
