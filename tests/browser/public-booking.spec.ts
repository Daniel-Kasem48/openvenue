import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from './fixtures';

test('public seat booking stays guest-only with an admin cookie and fits mobile', async ({
  page,
  request,
  baseURL,
}) => {
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const venue = await (
    await request.post('/api/venues', {
      data: { kind: 'cinema', name: `Public cinema ${Date.now()}` },
    })
  ).json();
  venue.layout.pricing = { mode: 'uniform', currency: 'EUR', amount: 1000 };
  expect(
    (
      await request.put(`/api/venues/${venue.id}`, {
        data: { name: venue.name, layout: venue.layout, revision: venue.revision },
      })
    ).status(),
  ).toBe(200);
  const show = await (
    await request.post(`/api/venues/${venue.id}/shows`, {
      data: {
        title: 'Public screening',
        start: '2091-01-01T12:00:00Z',
        end: '2091-01-01T14:00:00Z',
      },
    })
  ).json();
  expect(
    (
      await request.put(`/api/venues/${venue.id}/shows/${show.id}/pricing`, {
        data: { multiplier: 1.3, overrides: [] },
      })
    ).status(),
  ).toBe(200);
  await page.request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  await page.setViewportSize({ width: 390, height: 844 });
  const authRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/auth/me')) authRequests.push(r.url());
  });
  await page.goto(`/book/${venue.id}?show=${show.id}`);
  await expect(page.locator('.sidebar,.topbar,.profile')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Admin sign in', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Showtime')).toHaveValue(show.id);
  const fits = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  await fits();
  await page.getByRole('button', { name: 'Choose a place →', exact: true }).click();
  await fits();
  await page
    .getByRole('combobox', { name: 'Resource', exact: true })
    .selectOption(venue.layout.floors[0].resources[0].id);
  await page.getByRole('button', { name: 'Review reservation →', exact: true }).click();
  await page.getByLabel('Guest name').fill('Public guest');
  await page.getByLabel('Email (optional)', { exact: true }).fill('public-guest@example.test');
  await page.getByLabel('Phone (optional)', { exact: true }).fill('+49 123 456789');
  await fits();
  const result = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/bookings') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirm reservation', exact: true }).click();
  const booking = await (await result).json();
  expect(booking).toMatchObject({ price: 1300, currency: 'EUR' });
  expect(booking).not.toHaveProperty('guestEmail');
  expect(booking).not.toHaveProperty('guestPhone');
  const records = await (await request.get(`/api/bookings?venueId=${venue.id}`)).json();
  expect(records.items.find((item: { id: string }) => item.id === booking.id)).toMatchObject({
    guestEmail: 'public-guest@example.test',
    guestPhone: '+49 123 456789',
  });
  await expect(
    page.getByRole('heading', { name: 'Reservation confirmed', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.booking-reference')).toContainText(/[a-f0-9-]{36}/);
  await fits();
  expect(authRequests).toEqual([]);
  await page.goto(`/book/${venue.id}?show=${show.id}&embed=1`);
  await expect(page.getByLabel('Showtime')).toHaveValue(show.id);
  await expect(page.locator('.booking-hero,.page-footer,.sidebar,.topbar')).toHaveCount(0);
  const parent = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      `<iframe title="Booking" src="${baseURL}/book/${venue.id}?show=${show.id}&embed=1" width="390" height="844"></iframe>`,
    );
  });
  await new Promise<void>((resolve) => parent.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${(parent.address() as AddressInfo).port}`);
    await expect(page.frameLocator('iframe').getByLabel('Showtime')).toHaveValue(show.id);
    await expect(page.frameLocator('iframe').locator('.sidebar,.topbar,.booking-hero')).toHaveCount(
      0,
    );
  } finally {
    parent.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      parent.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('invalid, archived and missing-event public links show an explicit error', async ({
  page,
  request,
}) => {
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const venue = await (
    await request.post('/api/venues', {
      data: { kind: 'cinema', name: `Unavailable ${Date.now()}` },
    })
  ).json();
  for (const path of [
    '/book/not-an-id',
    `/book/${crypto.randomUUID()}`,
    `/book/${venue.id}?show=${crypto.randomUUID()}`,
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Booking unavailable' })).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('.sidebar,.venue-directory')).toHaveCount(0);
  }
  expect(
    (
      await request.patch(`/api/venues/${venue.id}`, {
        data: { revision: venue.revision, archived: true },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/book/${venue.id}`);
  await expect(page.getByRole('heading', { name: 'Booking unavailable' })).toBeVisible();
});

test('operator copies a public link and obtains an embed snippet', async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('.venue-list button').first().click();
  await page.getByRole('button', { name: 'More venue actions' }).click();
  await page.getByRole('menuitem', { name: 'Share booking link', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Booking link copied');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(new RegExp(`^${baseURL}/book/[a-f0-9-]{36}`));
  await page.getByRole('button', { name: 'More venue actions' }).click();
  await page.getByRole('menuitem', { name: 'Embed', exact: true }).click();
  const snippet = page.getByLabel('Embed code');
  await expect(snippet).toHaveValue(/<iframe src=".*\/book\/.*embed=1"/);
});
