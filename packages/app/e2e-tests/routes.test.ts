import { expect, test } from '@playwright/test';

test('internal navigation follows configured page paths, including disabled-feature recovery', async ({
  page,
}) => {
  test.skip(
    !process.env.PLAYWRIGHT_ROUTE_OVERRIDES,
    'Use the isolated --routes harness.',
  );
  await page.goto('/audit/root');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  const choices = page.getByRole('link', {
    name: 'Choose workspace features',
    exact: true,
  });
  await expect(choices).toHaveAttribute('href', '/audit/features');
  await choices.click();
  await expect(
    page.getByRole('heading', { name: 'Workspace features', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Enable all', exact: true }).click();
  await page
    .getByRole('button', { name: 'Save feature choices', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Feature choices saved');
  await page.goto('/audit/root');
  await page
    .getByRole('link', { name: 'Service workspace', exact: true })
    .click();
  await expect(page).toHaveURL(/\/audit\/workspace$/);
  await expect(
    page.getByRole('link', { name: 'Operations overview', exact: true }),
  ).toHaveAttribute('href', '/audit/root');
  await page.goto('/audit/inventory');
  await page
    .getByRole('link', { name: 'Set up a connection', exact: true })
    .click();
  await expect(page).toHaveURL(/\/audit\/connections$/);
  await expect(
    page.getByText('Drafting makes no connection', { exact: true }),
  ).toBeVisible();
  await page.goto('/audit/features');
  await page.getByRole('button', { name: 'Minimal', exact: true }).click();
  await page
    .getByRole('button', { name: 'Save feature choices', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Feature choices saved');
  await page.goto('/audit/connections');
  await expect(
    page.getByRole('heading', { name: 'Feature disabled', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Manage workspace features', exact: true })
    .click();
  await expect(page).toHaveURL(/\/audit\/features$/);
});
