import { expect, test } from './fixtures';

test('operator workspace gives the map the viewport and labels reservations', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('.venue-list button').first().click();
  await expect(page.locator('.map-stage')).toBeVisible();
  await page.locator('canvas').waitFor({ state: 'visible' });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({ path: '/tmp/openvenue-task02.png' });
  const map = (await page.locator('.map-stage').boundingBox())!;
  expect(map.y).toBeLessThanOrEqual(220);
  expect(map.height).toBeGreaterThanOrEqual(480);
  await expect(page.locator('.page-heading')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reservations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reservations', exact: true })).toBeVisible();
  await expect(page.locator('.page-footer')).toHaveCount(0);
});
