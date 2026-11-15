import { expect, test } from './fixtures';

test('operator renames, archives with typed confirmation, and restores a venue', async ({
  page,
}) => {
  await page.request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const name = `Settings venue ${Date.now()}`;
  const created = await page.request.post('/api/venues', { data: { name, kind: 'parking' } });
  expect(created.status()).toBe(201);
  await page.goto('/');
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await page.getByRole('button', { name: 'More venue actions' }).click();
  await page.getByRole('menuitem', { name: 'Venue settings' }).click();
  await page.getByLabel('Venue name', { exact: true }).fill(`${name} renamed`);
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.locator('.venue-panel h2')).toHaveText(`${name} renamed`);
  await page.getByRole('button', { name: 'More venue actions' }).click();
  await page.getByRole('menuitem', { name: 'Venue settings' }).click();
  const archive = page.getByRole('button', { name: 'Archive venue', exact: true });
  await expect(archive).toBeDisabled();
  await page.getByLabel('Confirm venue name').fill(`${name} renamed`);
  await archive.click();
  await expect(
    page.locator('.venue-list').getByRole('button', { name: new RegExp(name) }),
  ).toHaveCount(0);
  await page.reload();
  await page.locator('summary').filter({ hasText: 'Archived' }).click();
  await page.getByRole('button', { name: `Restore ${name} renamed`, exact: true }).click();
  await expect(
    page.locator('.venue-list').getByRole('button', { name: new RegExp(name) }),
  ).toBeVisible();
});
