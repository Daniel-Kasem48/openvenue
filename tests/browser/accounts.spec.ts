import { Pool } from 'pg';
import { expect, test } from './fixtures';

const prefix = `accounts-browser-${Date.now()}`;
const password = 'temporary-password-123';
let venueId: string | undefined;
test.afterEach(async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    if (venueId) {
      await pool.query('DELETE FROM bookings WHERE venue_id=$1', [venueId]);
      await pool.query('DELETE FROM resources WHERE venue_id=$1', [venueId]);
      await pool.query('DELETE FROM venues WHERE id=$1', [venueId]);
      venueId = undefined;
    }
    await pool.query(
      'DELETE FROM audit_log WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [`${prefix}%`],
    );
    await pool.query(
      'DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [`${prefix}%`],
    );
    await pool.query('DELETE FROM users WHERE email LIKE $1', [`${prefix}%`]);
  } finally {
    await pool.end();
  }
});

test('owner creates staff who can check in and undo on mobile without management controls', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Team', exact: true }).click();
  await page.getByLabel('Account name', { exact: true }).fill('Test owner');
  await page.getByLabel('Account email', { exact: true }).fill(`${prefix}-owner@example.com`);
  await page.getByLabel('Initial password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create owner', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
  const venue = await (
    await page.request.post('/api/venues', { data: { kind: 'parking', name: prefix } })
  ).json();
  venueId = venue.id;
  const start = new Date(Date.now() + 3600000);
  const booked = await page.request.post('/api/bookings', {
    data: {
      venueId,
      resourceId: venue.layout.floors[0].resources[0].id,
      guestName: `${prefix} guest`,
      start: start.toISOString(),
      end: new Date(+start + 3600000).toISOString(),
    },
  });
  expect(booked.status()).toBe(201);
  const booking = await booked.json();
  await page.getByLabel('Account name', { exact: true }).fill('Door staff');
  await page.getByLabel('Account email', { exact: true }).fill(`${prefix}-staff@example.com`);
  await page.getByLabel('Initial password', { exact: true }).fill(password);
  await page.getByLabel('Account role', { exact: true }).selectOption('staff');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText(`${prefix}-staff@example.com`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(`${prefix}-staff@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reservations', exact: true })).toBeVisible();
  for (const name of ['Team', 'New venue', 'Edit layout', 'Cancel reservation'])
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(page.getByText('Door staff · staff')).toBeVisible();
  await page.getByLabel('Search attendees').fill(booking.id);
  await page.getByRole('button', { name: booking.guestName, exact: true }).click();
  await expect(page.getByLabel('Staff notes')).toHaveAttribute('readonly', '');
  await expect(page.getByRole('button', { name: 'Save notes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark no-show' })).toHaveCount(0);
  if (booking.checkedInAt)
    await page.getByRole('button', { name: 'Undo check-in', exact: true }).click();
  await page.getByRole('button', { name: 'Check in', exact: true }).click();
  await page.getByRole('button', { name: 'Undo check-in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check in', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
