import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';

test('guest supplies contact details, operator finds by email, checks in and exports', async ({
  page,
  request,
}) => {
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const name = `Contact workflow ${Date.now()}`,
    email = `guest-${Date.now()}@example.test`;
  await request.post('/api/venues', { data: { kind: 'restaurant', name } });
  await page.goto('/');
  await page.getByRole('button', { name: `Book ${name} →`, exact: true }).click();
  await page.getByRole('button', { name: 'Choose a place →', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Resource', exact: true })
    .selectOption({ label: 'Table 1' });
  await page.getByRole('button', { name: 'Review reservation →', exact: true }).click();
  await page.getByLabel('Guest name').fill('Contact Browser Guest');
  await page.getByLabel('Email (optional)', { exact: true }).fill(email);
  await page.getByLabel('Phone (optional)', { exact: true }).fill('+49 30 12345');
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByRole('region', { name: 'Booking confirmation' })).toContainText(
    'Contact Browser Guest',
  );
  await page.getByRole('button', { name: 'Close booking', exact: true }).click();
  await expect(page.locator('.profile')).toContainText('Admin sign in');
  await page.locator('.profile').click();
  await page.getByLabel('Password', { exact: true }).fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Reservations', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search attendees', exact: true }).fill(email);
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Contact Browser Guest', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Reservation details', exact: true });
  await expect(drawer).toContainText(email);
  await expect(drawer).toContainText('+49 30 12345');
  await drawer.getByLabel('Staff notes').fill('Arriving at front entrance');
  await drawer.getByRole('button', { name: 'Save notes', exact: true }).click();
  await drawer.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(drawer.getByText('Checked in', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await drawer.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(row.getByText('Checked in', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export CSV', exact: true }).click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain(email);
  expect(csv).toContain('Arriving at front entrance');
  await row.getByRole('button', { name: 'Contact Browser Guest', exact: true }).click();
  await drawer.getByRole('button', { name: 'Mark no-show', exact: true }).click();
  await expect(drawer.getByText('No-show', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Check in', exact: true })).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('no_show');
  await expect(row.getByText('No-show', { exact: true })).toBeVisible();
});
