import { expect, test } from '@playwright/test';

test('personal profile keeps a single workspace with no team setup required', async ({
  page,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_WORKSPACE_PROFILE !== 'personal',
    'Use the isolated personal harness.',
  );
  await page.goto('/workspaces');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Workspaces', exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText('Personal mode', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Workspace name', { exact: true })).toHaveValue(
    'Personal workspace',
  );
  await expect(
    page.getByRole('button', { name: 'Create workspace', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Member identity')).toHaveCount(0);
});

test('team workspaces switch scoped feature state, persist selection and protect the last admin', async ({
  page,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_WORKSPACE_PROFILE !== 'team',
    'Use the isolated --team harness.',
  );
  await page.goto('/workspaces');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(page.getByText('Team mode', { exact: true })).toBeVisible();
  await page
    .getByLabel('New workspace name', { exact: true })
    .fill('Team sandbox');
  await page
    .getByRole('button', { name: 'Create workspace', exact: true })
    .click();
  await expect(page.getByLabel('Workspace name', { exact: true })).toHaveValue(
    'Team sandbox',
  );
  await page.getByLabel('Member identity').fill('user:default/reviewer');
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  await expect(page.getByLabel('Role for user:default/reviewer')).toBeVisible();
  await page.getByLabel('Role for user:default/guest').click();
  await page.getByRole('option', { name: 'User', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: /Error: Keep at least one administrator/,
    }),
  ).toBeVisible();
  await page.goto('/features');
  await expect(
    page.getByText('0 of 9 optional modules selected'),
  ).toBeVisible();
  await page
    .getByRole('switch', { name: 'Cost tracking', exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Save feature choices', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Feature choices saved');
  await page.goto('/workspaces');
  await page.reload();
  await expect(page.getByLabel('Workspace name', { exact: true })).toHaveValue(
    'Team sandbox',
  );
  await page
    .getByRole('button', { name: 'Select workspace', exact: true })
    .click();
  await expect(page.getByLabel('Workspace name', { exact: true })).toHaveValue(
    'Personal workspace',
  );
  await page.goto('/features');
  await expect(
    page.getByRole('switch', { name: 'Cost tracking', exact: true }),
  ).not.toBeChecked();
  await page.goto('/workspaces');
  await page
    .getByRole('button', { name: 'Select workspace', exact: true })
    .click();
  await expect(page.getByLabel('Workspace name', { exact: true })).toHaveValue(
    'Team sandbox',
  );
  if (process.env.PLAYWRIGHT_WORKSPACE_CAPTURE_DIR) {
    await page.screenshot({
      path: `${process.env.PLAYWRIGHT_WORKSPACE_CAPTURE_DIR}/team-workspaces.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
