import { test, expect } from '@playwright/test';

test('inventory labels its source and clears old results after a failed refresh', async ({
  page,
}) => {
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  const demo = process.env.PLAYWRIGHT_EXPECT_MODE === 'demo';
  await expect(
    page.getByRole('heading', {
      name: demo ? 'Synthetic AWS inventory' : 'Connect your AWS inventory',
    }),
  ).toBeVisible();
  await expect(
    page.getByText(`Source: ${demo ? 'demo' : 'none'}`, { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.route('**/api/operations/inventory', route =>
    route.abort('failed'),
  );
  await page.getByRole('button', { name: 'Refresh inventory' }).click();
  await expect(
    page.getByRole('heading', {
      name: demo ? 'Synthetic AWS inventory' : 'Connect your AWS inventory',
    }),
  ).toHaveCount(0);
  await expect(page.getByText('Source: demo', { exact: true })).toHaveCount(0);
});
