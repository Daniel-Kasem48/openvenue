import { expect, test } from './fixtures';
import { localTime } from '../../apps/web/src/api';

test('operator creates, edits, deletes and explicitly cancels events', async ({
  page,
  request,
}) => {
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const venue = await (
    await request.post('/api/venues', {
      data: { kind: 'cinema', name: `Event workflow ${Date.now()}` },
    })
  ).json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: `${venue.name} Cinema`, exact: true })
    .click();
  await page.getByRole('tab', { name: 'Events', exact: true }).click();
  await page.getByRole('button', { name: 'Add showtime', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Show title').fill('First screening');
  await dialog.getByLabel('Starts').fill(localTime(new Date('2186-01-01T12:00:00Z')));
  await dialog.getByLabel('Ends').fill(localTime(new Date('2186-01-01T14:00:00Z')));
  await dialog.getByRole('button', { name: 'Add showtime', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'First screening' });
  await expect(row).toContainText('0 / 48');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('Edit showtime');
  await dialog.getByLabel('Show title').fill('Renamed screening');
  await dialog.getByLabel('Starts').fill(localTime(new Date('2186-01-02T12:00:00Z')));
  await dialog.getByLabel('Ends').fill(localTime(new Date('2186-01-02T14:00:00Z')));
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  const renamed = page.getByRole('row').filter({ hasText: 'Renamed screening' });
  await expect(renamed).toBeVisible();
  page.once('dialog', async (confirm) => {
    expect(confirm.message()).toContain('0 confirmed reservations');
    await confirm.accept();
  });
  await renamed.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(renamed).toHaveCount(0);
  const show = await (
    await request.post(`/api/venues/${venue.id}/shows`, {
      data: {
        title: 'Booked screening',
        start: '2186-01-03T12:00:00Z',
        end: '2186-01-03T14:00:00Z',
      },
    })
  ).json();
  expect(
    (
      await request.post('/api/bookings', {
        data: {
          venueId: venue.id,
          resourceId: venue.layout.floors[0].resources[0].id,
          showId: show.id,
          guestName: 'Cancelled event guest',
        },
      })
    ).status(),
  ).toBe(201);
  await page.getByRole('button', { name: 'Refresh events', exact: true }).click();
  const booked = page.getByRole('row').filter({ hasText: 'Booked screening' });
  await expect(booked).toContainText('1 / 48');
  await expect(booked.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
  page.once('dialog', async (confirm) => {
    expect(confirm.message()).toContain('1 confirmed reservations will be cancelled');
    await confirm.accept();
  });
  await booked.getByRole('button', { name: 'Cancel event', exact: true }).click();
  await expect(booked).toHaveCount(0);
});

test('guest reviews a rescheduled event before confirming again', async ({ page, request }) => {
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const name = `Rescheduled ${Date.now()}`;
  const venue = await (
    await request.post('/api/venues', { data: { kind: 'cinema', name } })
  ).json();
  const start = new Date(Date.now() + 86400000).toISOString(),
    end = new Date(Date.now() + 93600000).toISOString();
  const show = await (
    await request.post(`/api/venues/${venue.id}/shows`, {
      data: { title: 'Guest event', start, end },
    })
  ).json();
  await page.goto('/');
  await page.getByRole('button', { name: `Book ${name} →`, exact: true }).click();
  await page.getByRole('button', { name: 'Choose a place' }).click();
  await page
    .getByRole('combobox', { name: 'Resource', exact: true })
    .selectOption({ label: 'Row A · Seat 1' });
  await page.getByRole('button', { name: 'Review reservation' }).click();
  await page.getByLabel('Guest name').fill('Rescheduled guest');
  const moved = {
    title: show.title,
    start: new Date(Date.parse(start) + 86400000).toISOString(),
    end: new Date(Date.parse(end) + 86400000).toISOString(),
  };
  expect(
    (await request.put(`/api/venues/${venue.id}/shows/${show.id}`, { data: moved })).ok(),
  ).toBe(true);
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByRole('alert')).toContainText('Event time changed');
  const response = page.waitForResponse(
    (res) => res.url().endsWith('/api/bookings') && res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  const booking = await (await response).json();
  expect(Date.parse(booking.start)).toBe(Date.parse(moved.start));
  await expect(page.getByText('Reservation confirmed', { exact: true })).toBeVisible();
});
