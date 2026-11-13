import { expect, test } from '@playwright/test';
test('operator creates a template, edits a map and manages a reservation', async ({ page }) => {
  const venueName = `Browser restaurant ${Date.now()}`;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Where would you like to go?' })).toBeVisible();
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password').fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'New venue' }).click();
  await page.getByLabel('Venue name').fill(venueName);
  await page.getByRole('button', { name: 'Create venue' }).click();
  await expect(page.getByRole('heading', { name: venueName })).toBeVisible();
  await page.getByRole('button', { name: 'Edit layout' }).click();
  await page.getByRole('button', { name: 'Select Table 1', exact: true }).click();
  await page.getByLabel('Resource label').fill('Window table');
  await page.getByLabel('Table shape').selectOption('rectangle');
  await page.getByRole('button', { name: '+ plant', exact: true }).click();
  await page.getByLabel('Object label').fill('Window fern');
  await page.getByLabel('height', { exact: true }).fill('1.8');
  await page.getByRole('button', { name: 'Save layout' }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  const persisted = (await (await page.request.get('/api/venues')).json()).find(
    (v: any) => v.name === venueName,
  );
  expect(
    persisted.layout.floors[0].objects.find((o: any) => o.label === 'Window fern').height,
  ).toBe(1.8);
  expect(persisted.layout.floors[0].resources[0].shape).toBe('rectangle');
  await page.reload();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(venueName) })
    .click();
  await page.getByRole('button', { name: '3D view' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: '2D view' }).click();
  await page.getByRole('button', { name: 'Select Window table', exact: true }).click();
  await page.getByLabel('Guest name').fill('Browser Guest');
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByRole('status')).toContainText('Reservation confirmed');
  await page.getByRole('button', { name: 'Reservations', exact: true }).click();
  await expect(
    page.getByRole('row').filter({ hasText: venueName }).getByText('Browser Guest'),
  ).toBeVisible();
  await page
    .getByRole('row')
    .filter({ hasText: venueName })
    .getByRole('button', { name: 'Cancel reservation' })
    .click();
  await expect(page.getByRole('status')).toContainText('Reservation cancelled');
});
test('parking and cinema templates have independent layouts and show controls', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('.venue-list')
    .getByRole('button', { name: /Central Parking/ })
    .click();
  await page.getByRole('button', { name: 'Choose a place' }).click();
  await page.getByRole('button', { name: '2D view' }).click();
  await expect(page.getByLabel('Floor', { exact: true })).toHaveValue('0');
  await page.getByLabel('Floor', { exact: true }).selectOption('1');
  await expect(page.getByRole('button', { name: 'Select P2-01', exact: true })).toBeVisible();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: /Studio Cinema/ })
    .click();
  await expect(page.getByLabel('Showtime')).toBeVisible();
});

test('workspace works on desktop and mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page
    .locator('.venue-list')
    .getByRole('button', { name: /The Greenhouse/ })
    .click();
  await page.getByRole('button', { name: 'Choose a place' }).click();
  await page.getByRole('button', { name: '2D view' }).click();
  await expect(page.getByRole('button', { name: 'Select Table 1', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/openvenue-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Select Table 1', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '/tmp/openvenue-mobile.png', fullPage: true });
});

test('freezes edits and navigation until an in-flight layout save finishes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password').fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'New venue' }).click();
  await page.getByLabel('Venue name').fill(`Save race ${Date.now()}`);
  await page.getByRole('button', { name: 'Create venue' }).click();
  await page.getByRole('button', { name: 'Edit layout' }).click();
  await page.getByRole('button', { name: 'Select Table 1', exact: true }).click();
  await page.getByLabel('Resource label').fill('Safe label');
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/venues/*', async (route) => {
    if (route.request().method() === 'PUT') {
      await barrier;
    }
    await route.continue();
  });
  const request = page.waitForRequest((r) => r.method() === 'PUT');
  await page.getByRole('button', { name: 'Save layout' }).click();
  await request;
  try {
    await expect(page.locator('.shell')).toHaveAttribute('inert', '');
  } finally {
    release();
  }
  await expect(page.getByRole('status')).toContainText('Layout saved');
  await expect(page.getByRole('button', { name: 'Select Safe label', exact: true })).toBeVisible();
});

test('3D scene is the default and all venue types expose selectable models', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const venues = [];
  for (const [kind, resource] of [
    ['restaurant', 'Table 1'],
    ['parking', 'P1-01'],
    ['cinema', 'A1'],
  ]) {
    const name = '3D ' + kind + ' ' + Date.now();
    await request.post('/api/venues', { data: { kind, name } });
    venues.push([name, resource, kind]);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password').fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  for (const [venue, resource, kind] of venues) {
    await page
      .locator('.venue-list')
      .getByRole('button', { name: new RegExp(venue) })
      .click();
    await expect(page.getByRole('button', { name: '3D view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('canvas')).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Resource', exact: true })
      .selectOption({ label: resource });
    await expect(page.locator('.selection-card strong')).toHaveText(resource);
    await expect(page.getByRole('button', { name: 'Reset 3D camera' })).toBeVisible();
    await page.getByRole('button', { name: 'Reset 3D camera' }).click();
    await page.screenshot({ path: `/tmp/openvenue-3d-${kind}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('guest follows venue, time, place, review and confirmation with conflict recovery', async ({
  page,
  request,
}) => {
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const name = `Guest journey ${Date.now()}`;
  const venue = await (
    await request.post('/api/venues', { data: { kind: 'restaurant', name } })
  ).json();
  await page.goto('/');
  await page.getByRole('button', { name: `Book ${name} →`, exact: true }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.getByLabel('Leaving').fill('2020-01-01T12:00');
  await expect(page.getByRole('button', { name: 'Choose a place' })).toBeDisabled();
  const start = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  const end = new Date(Date.now() + 90000000).toISOString().slice(0, 16);
  await page.getByLabel('Arriving').fill(start);
  await page.getByLabel('Leaving').fill(end);
  await page.getByRole('button', { name: 'Choose a place' }).click();
  await expect(page.getByRole('button', { name: '3D view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Review reservation' })).toBeDisabled();
  await page
    .getByRole('combobox', { name: 'Resource', exact: true })
    .selectOption({ label: 'Table 1' });
  await page.getByRole('button', { name: 'Review reservation' }).click();
  await page.getByLabel('Guest name').fill('Journey Guest');
  // Another visitor reserves the selection after the availability check.
  await request.post('/api/bookings', {
    data: {
      venueId: venue.id,
      resourceId: venue.layout.floors[0].resources[0].id,
      guestName: 'Other Guest',
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    },
  });
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Guest name')).toHaveValue('Journey Guest');
  await page.getByRole('button', { name: 'Change place' }).click();
  await page
    .getByRole('combobox', { name: 'Resource', exact: true })
    .selectOption({ label: 'Table 2' });
  await page.getByRole('button', { name: 'Review reservation' }).click();
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  const receipt = page.getByRole('region', { name: 'Booking confirmation' });
  await expect(receipt).toContainText('Journey Guest');
  await expect(receipt).toContainText('Table 2');
  await expect(receipt).toContainText(name);
  await expect(receipt.locator('.booking-reference')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Book another visit' }).click();
  await expect(page.getByRole('region', { name: 'Venue directory' })).toBeVisible();
});

test('restaurant party size requires a table with sufficient capacity', async ({
  page,
  request,
}) => {
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const name = `Party capacity ${Date.now()}`;
  await request.post('/api/venues', { data: { name, kind: 'restaurant' } });
  await page.goto('/');
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await page.getByLabel('Number of guests').selectOption('4');
  await page.getByRole('button', { name: 'Choose a place' }).click();
  const select = page.getByRole('combobox', { name: 'Resource', exact: true });
  const data = await (await page.request.get('/api/venues')).json();
  const v = data.find((v: any) => v.name === name);
  const small = v.layout.floors[0].resources.find((r: any) => r.capacity < 4);
  const large = v.layout.floors[0].resources.find((r: any) => r.capacity >= 4);
  await expect(select.locator(`option[value="${small.id}"]`)).toBeDisabled();
  await select.selectOption(large.id);
  await expect(page.getByRole('button', { name: 'Review reservation' })).toBeEnabled();
});

test('stadium is editable data, supports seat counts and saves per-seat prices', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const name = `Stadium workflow ${Date.now()}`;
  const venue = await (
    await request.post('/api/venues', { data: { name, kind: 'stadium' } })
  ).json();
  const start = new Date(Date.now() + 86400000).toISOString(),
    end = new Date(Date.now() + 93600000).toISOString();
  await request.post(`/api/venues/${venue.id}/shows`, {
    data: { title: 'Home match', start, end },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password').fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await page.getByRole('button', { name: 'Edit layout' }).click();
  await page.getByRole('button', { name: 'Select North A1', exact: true }).click();
  await page.getByLabel('Reservation price', { exact: true }).fill('12.50');
  await page.getByRole('button', { name: 'Select Football pitch', exact: true }).click();
  await page.getByLabel('Object label').fill('Custom pitch');
  await page.getByRole('button', { name: 'Save layout' }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  await page.reload();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await page.getByRole('button', { name: 'Edit layout' }).click();
  await page.getByRole('button', { name: 'Select Custom pitch', exact: true }).click();
  await expect(page.getByLabel('Object label')).toHaveValue('Custom pitch');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.locator('.profile').click();
  await page.getByRole('button', { name: `Book ${name} →`, exact: true }).click();
  await page.getByLabel('Number of seats').selectOption('2');
  await page.getByRole('button', { name: 'Choose a place' }).click();
  await expect(page.getByRole('button', { name: '3D view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('canvas')).toBeVisible();
  const select = page.getByRole('combobox', { name: 'Resource', exact: true });
  await select.selectOption(venue.layout.floors[0].resources[0].id);
  await expect(page.getByRole('button', { name: 'Review reservation' })).toBeDisabled();
  await select.selectOption(venue.layout.floors[0].resources[1].id);
  await page.screenshot({ path: '/tmp/openvenue-stadium.png', fullPage: true });
  await page.getByRole('button', { name: 'Review reservation' }).click();
  await expect(page.getByLabel('Reservation price summary')).toContainText('$57.50');
  await page.getByLabel('Guest name').fill('Stadium Guests');
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  const receipt = page.getByRole('region', { name: 'Booking confirmation' });
  await expect(receipt).toContainText('$57.50');
  await expect(receipt).toContainText('North A1, North A2');
});

test('guest can replace a seat removed by an operator after review', async ({ page, request }) => {
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const name = `Seat removed ${Date.now()}`;
  const venue = await (
    await request.post('/api/venues', { data: { name, kind: 'cinema' } })
  ).json();
  await request.post(`/api/venues/${venue.id}/shows`, {
    data: {
      title: 'Screening',
      start: new Date(Date.now() + 86400000).toISOString(),
      end: new Date(Date.now() + 93600000).toISOString(),
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: `Book ${name} →`, exact: true }).click();
  await page.getByRole('button', { name: 'Choose a place' }).click();
  await page.getByRole('combobox', { name: 'Resource', exact: true }).selectOption({ label: 'A1' });
  await page.getByRole('button', { name: 'Review reservation' }).click();
  await page.getByLabel('Guest name').fill('Guest with removed seat');
  venue.layout.floors[0].resources.shift();
  const response = await request.put(`/api/venues/${venue.id}`, {
    data: { layout: venue.layout, name: venue.name, revision: venue.revision },
  });
  expect(response.ok()).toBe(true);
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByRole('alert')).toContainText('Resource not found');
  await page.getByRole('button', { name: 'Change place' }).click();
  await page.getByRole('combobox', { name: 'Resource', exact: true }).selectOption({ label: 'A2' });
  await expect(page.getByRole('button', { name: 'Review reservation' })).toBeEnabled();
});

test('operator builds an empty scene and saved objects survive reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password').fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'New venue' }).click();
  const name = `Empty stadium ${Date.now()}`;
  await page.getByLabel('Venue name').fill(name);
  await page.getByRole('combobox', { name: 'Template', exact: true }).selectOption('stadium');
  await page.getByLabel('Starting layout').selectOption('empty');
  await page.getByRole('button', { name: 'Create venue' }).click();
  await page.getByRole('button', { name: 'Edit layout' }).click();
  await expect(
    page.getByRole('button', { name: 'Select Football pitch', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '+ pitch', exact: true }).click();
  await page.getByLabel('Object label').fill('My custom field');
  await page.getByLabel('Object color').fill('#123456');
  await page.getByLabel('width', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Save layout' }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  await page.reload();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await page.getByRole('button', { name: 'Edit layout' }).click();
  await page.getByRole('button', { name: 'Select My custom field', exact: true }).click();
  await expect(page.getByLabel('width', { exact: true })).toHaveValue('25');
  await expect(page.getByLabel('Object color')).toHaveValue('#123456');
});
