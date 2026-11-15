import { expect, test } from './fixtures';

test('sign-in and restored sessions show a newly created booking in Overview', async ({
  page,
  request,
}) => {
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const venue = await (
    await request.post('/api/venues', {
      data: { kind: 'cinema', name: `Overview cinema ${Date.now()}` },
    })
  ).json();
  const start = new Date(Date.now() + 60000),
    end = new Date(+start + 3600000);
  const show = await (
    await request.post(`/api/venues/${venue.id}/shows`, {
      data: {
        title: `Overview screening ${Date.now()}`,
        start: start.toISOString(),
        end: end.toISOString(),
      },
    })
  ).json();
  const guestName = `Overview guest ${Date.now()}`;
  const booked = await request.post('/api/bookings', {
    data: {
      venueId: venue.id,
      resourceId: venue.layout.floors[0].resources[0].id,
      showId: show.id,
      guestName,
    },
  });
  expect(booked.status()).toBe(201);
  const booking = await booked.json();
  await request.post('/api/auth/logout');
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const overview = page.getByRole('region', { name: 'Operator overview' });
  await expect(overview.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(overview.getByText(guestName, { exact: true })).toBeVisible();
  await expect(overview.getByText('Not collected', { exact: true })).toBeVisible();
  await page.getByLabel('Time range').selectOption('30');
  await expect(overview.getByText(guestName, { exact: true })).toBeVisible();
  await page.reload();
  await expect(overview.getByText(guestName, { exact: true })).toBeVisible();
  await overview
    .getByRole('button', { name: `Manage event seats: ${show.title}`, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Block selected seats', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Showtime')).toHaveValue(show.id);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await overview.getByRole('button', { name: 'View reservations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reservations', exact: true })).toBeVisible();
  await page.getByLabel('Search attendees').fill(guestName);
  await expect(
    page.getByRole('cell', { name: `${guestName} ${booking.id}`, exact: true }),
  ).toBeVisible();
});
