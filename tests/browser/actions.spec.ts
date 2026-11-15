import { expect, test } from './fixtures';

test('venue action menu supports keyboard, outside click and dirty save state', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('.venue-list button').first().click();
  const trigger = page.getByRole('button', { name: 'More venue actions' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Duplicate', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Generate with Claude' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await trigger.press('ArrowDown');
  await page.keyboard.press('Shift+Tab');
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await trigger.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'Generate with Claude' })).toBeFocused();
  await page.locator('.venue-panel h2').click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save layout', exact: true })).toBeDisabled();
  await page.locator('.map-resource').first().click();
  await page.getByLabel('Resource label').fill('Menu edited seat');
  await expect(page.getByRole('button', { name: 'Save layout', exact: true })).toBeEnabled();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
});
