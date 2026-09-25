import { test, expect } from '@playwright/test';

test('agent page previews cited evidence and clears it after source failure', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1150 });
  await page.goto('/agent');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(
    page
      .getByRole('main')
      .getByRole('heading', { name: 'Agent access', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Generate preview' }).click();
  const preview = page.getByLabel('Agent context JSON');
  await expect(preview).toContainText('evidence-context');
  const isDemo = process.env.PLAYWRIGHT_EXPECT_MODE === 'demo';
  await expect(preview).toContainText(
    isDemo ? '"freshness": "stale"' : '"source": "none"',
  );
  await expect(preview).toContainText('runbook:health');
  await expect(
    page.getByText(isDemo ? '1 unknown' : '0 unknown', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Purpose').click();
  await page.getByRole('option', { name: 'Draft a worklog' }).click();
  await expect(preview).toHaveCount(0);
  await page.getByRole('button', { name: 'Generate preview' }).click();
  await expect(preview).toContainText(
    'Actions actually performed: not supplied',
  );
  await page.screenshot({ path: 'test-results/agent.png', fullPage: true });
  await page.route('**/api/operations/agent/context?*', route =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"unavailable"}',
    }),
  );
  await page.getByRole('button', { name: 'Generate preview' }).click();
  await expect(
    page.getByText('Evidence unavailable.', { exact: false }).first(),
  ).toBeVisible();
  await expect(preview).toHaveCount(0);
  await page.getByRole('link', { name: 'Agent setup guide' }).click();
  await expect(
    page.getByRole('heading', {
      name: /^Agent access through MCP or HTTP/,
      level: 1,
    }),
  ).toBeVisible({ timeout: 90_000 });
});
