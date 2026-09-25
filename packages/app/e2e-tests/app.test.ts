import { test, expect } from '@playwright/test';

const isDemo = process.env.PLAYWRIGHT_EXPECT_MODE === 'demo';

test('operations connects evidence, filtering, catalog and the handbook', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1150 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  if (isDemo) {
    await expect(
      page.getByText('Demo workspace', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Gateway readiness' }),
    ).toBeVisible();
    await expect(
      page.getByText('Stale evidence', { exact: false }),
    ).toBeVisible();
    await page.getByLabel('Status', { exact: true }).click();
    await page.getByRole('option', { name: 'Needs attention' }).click();
    await expect(
      page.getByRole('heading', { name: 'Gateway readiness' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Backup verification' }),
    ).toBeVisible();
    await page.getByLabel('Find a check or service').fill('disk');
    await expect(
      page.getByRole('heading', { name: 'Root disk capacity' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Backup verification' }),
    ).toHaveCount(0);
    await page.getByLabel('Find a check or service').fill('');
  } else {
    await expect(
      page.getByText('Connect your first source', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Open catalog entity' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Connect AWS CloudWatch' }),
    ).toBeVisible();
    await expect(
      page.getByText('source: none', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText('No observations yet.', { exact: false }),
    ).toBeVisible();
  }
  await page.screenshot({
    path: 'test-results/operations.png',
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'Software catalog', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Ops Compass', exact: true }),
  ).toBeVisible();
  if (!isDemo) {
    await expect(
      page.getByRole('link', { name: 'API Gateway', exact: true }),
    ).toHaveCount(0);
  }
  await page.goto('/');
  await page
    .getByRole('link', { name: 'Operations handbook', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: /^Ops Compass Handbook/, level: 1 }),
  ).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: 'test-results/handbook.png', fullPage: true });
});

test('backend source failure removes old healthy results', async ({ page }) => {
  // Exercise clearing actual displayed evidence even on the empty main branch.
  // This test-only response is never installed as an application data source.
  await page.route('**/api/operations/overview', route =>
    route.fulfill({
      json: {
        mode: 'snapshot',
        source: 'ssh',
        evaluatedAt: new Date().toISOString(),
        maxAgeSeconds: 300,
        overall: 'healthy',
        counts: { healthy: 1, warning: 0, critical: 0, unknown: 0 },
        observations: [
          {
            id: 'test-check',
            entityRef: 'resource:default/test-host',
            label: 'Test readiness',
            environment: 'test',
            region: 'test',
            state: 'healthy',
            reportedState: 'healthy',
            freshness: 'current',
            observedAt: new Date().toISOString(),
            summary: 'Browser test input',
          },
        ],
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Test readiness' }),
  ).toBeVisible();
  await page.route('**/api/operations/overview', route =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unavailable' }),
    }),
  );
  await page.getByRole('button', { name: 'Refresh observations' }).click();
  await expect(
    page.getByText('Observation source unavailable.', { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Test readiness' }),
  ).toHaveCount(0);
});
