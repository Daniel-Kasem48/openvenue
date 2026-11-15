import { makeTemplate } from '@openvenue/contracts';
import { expect, test } from './fixtures';
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
  await page
    .getByRole('combobox', { name: 'Venue', exact: true })
    .selectOption({ label: venueName });
  await expect(
    page.getByRole('row').filter({ hasText: venueName }).getByText('Browser Guest'),
  ).toBeVisible();
  const attendeeSearch = page.getByRole('searchbox', { name: 'Search attendees' });
  await attendeeSearch.fill('  bRoWsEr  ');
  await expect(page.getByRole('row').filter({ hasText: venueName })).toBeVisible();
  await attendeeSearch.fill('no-such-attendee-123');
  await expect(page.getByText('No reservations match this attendee.')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: venueName })).toHaveCount(0);
  await attendeeSearch.fill('');
  await expect(page.getByRole('row').filter({ hasText: venueName })).toBeVisible();
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
    ['cinema', 'Row A · Seat 1'],
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
  await expect(page.getByRole('button', { name: 'Select North A1', exact: true })).toHaveCSS(
    'outline-style',
    'none',
  );
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
  await page.getByRole('button', { name: 'Done editing', exact: true }).click();
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
  await expect(select).toHaveValue(venue.layout.floors[0].resources[1].id);
  await page.screenshot({ path: '/tmp/openvenue-stadium.png', fullPage: true });
  await page.getByRole('button', { name: 'Review reservation' }).click();
  await expect(page.getByLabel('Reservation price summary')).toContainText('$57.50');
  await page.getByLabel('Guest name').fill('Stadium Guests');
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  const receipt = page.getByRole('region', { name: 'Booking confirmation' });
  await expect(receipt).toContainText('$57.50');
  await expect(receipt).toContainText('Block 60 · Row A · Seat 1, Block 60 · Row A · Seat 2');
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
  await page
    .getByRole('combobox', { name: 'Resource', exact: true })
    .selectOption({ label: 'Row A · Seat 1' });
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
  await page
    .getByRole('combobox', { name: 'Resource', exact: true })
    .selectOption({ label: 'Row A · Seat 2' });
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

test('camera presets and touch gestures change the 3D viewpoint', async ({ page, request }) => {
  test.setTimeout(90000);
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const name = `Camera ${Date.now()}`;
  await request.post('/api/venues', { data: { name, kind: 'parking', empty: true } });
  await page.goto('/');
  await page.getByRole('button', { name: `Book ${name} →`, exact: true }).click();
  await page.getByRole('button', { name: 'Choose a place' }).click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveCSS('touch-action', 'none');
  // Wait for the initial bounds animation to settle before comparing viewpoints.
  await page.waitForTimeout(500);
  const before = await canvas.screenshot();
  await page.getByRole('button', { name: 'Top camera view', exact: true }).click();
  await expect.poll(async () => !(await canvas.screenshot()).equals(before)).toBe(true);
  await page.waitForTimeout(500);
  const top = await canvas.screenshot();
  await page.getByRole('button', { name: 'South camera view', exact: true }).click();
  await expect.poll(async () => !(await canvas.screenshot()).equals(top)).toBe(true);
  await page.waitForTimeout(500);
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const start = await canvas.screenshot();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let i = 1; i <= 10; i++)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + i * 12, y: y + i * 3, id: 1 }],
    });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => !(await canvas.screenshot()).equals(start)).toBe(true);
  await page.getByRole('button', { name: 'Reset 3D camera' }).click();
});

test('selection and review preserve a manually panned and zoomed camera', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  // Observe the actual GPU view matrix without adding test state to the application.
  await page.addInitScript(() => {
    const locations = new WeakMap<WebGLUniformLocation, string>();
    const proto = WebGL2RenderingContext.prototype;
    const get = proto.getUniformLocation,
      set = proto.uniformMatrix4fv;
    proto.getUniformLocation = function (program, name) {
      const location = get.call(this, program, name);
      if (location) locations.set(location, name);
      return location;
    };
    proto.uniformMatrix4fv = function (location, transpose, data, ...rest) {
      if (location && locations.get(location) === 'viewMatrix')
        (window as any).__cameraView = Array.from(data as Iterable<number>);
      return (set as any).call(this, location, transpose, data, ...rest);
    };
  });
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const name = `Camera selection ${Date.now()}`;
  const venue = await (
    await request.post('/api/venues', { data: { name, kind: 'parking' } })
  ).json();
  venue.layout.floors = venue.layout.floors.slice(0, 1);
  venue.layout.floors[0].objects = [];
  venue.layout.floors[0].resources = venue.layout.floors[0].resources.slice(0, 2);
  expect(
    (
      await request.put(`/api/venues/${venue.id}`, {
        data: { name, layout: venue.layout, revision: venue.revision },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: `Book ${name} →`, exact: true }).click();
  await page.getByRole('button', { name: 'Choose a place' }).click();
  await expect(page.locator('.map-scale')).toContainText('Ctrl + drag to pan');
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => (window as any).__cameraView?.length)).toBe(16);
  await page.waitForTimeout(600);
  // Canvas sizing can move its centre after the initial scroll; hover waits and scrolls again.
  await canvas.hover();
  const initial = await page.evaluate(() => (window as any).__cameraView);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(1200);
  let previousPose = '';
  await expect
    .poll(
      async () => {
        const next = JSON.stringify(await page.evaluate(() => (window as any).__cameraView));
        const stable = next === previousPose;
        previousPose = next;
        return stable;
      },
      { timeout: 10000, intervals: [200] },
    )
    .toBe(true);
  // OrbitControls retains sub-centimetre pan damping when new frames are requested.
  const pose = await page.evaluate(() => (window as any).__cameraView);
  expect(pose).not.toEqual(initial);
  await page
    .getByRole('combobox', { name: 'Resource', exact: true })
    .selectOption(venue.layout.floors[0].resources[0].id);
  // A longer selection summary expands the adjacent panel and resizes the canvas.
  await page.locator('.inspector').evaluate((el) => {
    el.style.minHeight = '950px';
  });
  await page.waitForTimeout(700);
  (await page.evaluate(() => (window as any).__cameraView)).forEach((value: number, i: number) =>
    expect(Math.abs(value - pose[i])).toBeLessThan(i < 12 ? 0.0001 : 0.02),
  );
  await page.getByRole('button', { name: 'Review reservation' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Change place' }).click();
  await page.waitForTimeout(700);
  (await page.evaluate(() => (window as any).__cameraView)).forEach((value: number, i: number) =>
    expect(Math.abs(value - pose[i])).toBeLessThan(i < 12 ? 0.0001 : 0.02),
  );
});

test('stadium block numbers persist and keyboard focus stays close to the seat', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const name = `Numbered stadium ${Date.now()}`;
  const venue = await (
    await request.post('/api/venues', { data: { name, kind: 'stadium' } })
  ).json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password').fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await page.getByRole('button', { name: 'Edit layout' }).click();
  const seat = page.getByRole('button', { name: 'Select North A1', exact: true });
  await page.keyboard.press('Tab');
  await seat.focus();
  await expect(seat).toHaveCSS('outline-style', 'none');
  await expect(seat.locator('.resource-focus-ring')).toHaveCSS('visibility', 'visible');
  const bounds = await seat
    .locator('.resource-focus-ring')
    .evaluate((e) => ({ width: e.getAttribute('width'), height: e.getAttribute('height') }));
  expect(Number(bounds.width)).toBeLessThan(1);
  expect(Number(bounds.height)).toBeLessThan(1.1);
  await page.getByRole('button', { name: 'Select block 60', exact: true }).click();
  await page.getByLabel('Object label').fill('160');
  await page.getByRole('button', { name: 'Save layout' }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  await page.reload();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await expect(page.locator('canvas')).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Resource', exact: true })
    .selectOption(venue.layout.floors[0].resources[0].id);
  await expect(page.locator('.selection-card strong')).toContainText('Block 160');
  await page.screenshot({ path: '/tmp/openvenue-numbered-stadium.png', fullPage: true });
  const resourceInput = page.getByRole('combobox', { name: 'Resource', exact: true });
  await expect(resourceInput).toHaveValue(venue.layout.floors[0].resources[0].id);
  await page.getByRole('button', { name: '2D view' }).click();
  await expect(page.locator('svg text').filter({ hasText: /^160$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Select North A2', exact: true }).click();
  await page.getByRole('button', { name: '3D view' }).click();
  await expect(resourceInput).toHaveValue(venue.layout.floors[0].resources[1].id);
  await expect(page.locator('.selection-card strong')).toContainText('Row A · Seat 2');
  await page.getByRole('button', { name: 'Remove North A2', exact: true }).click();
  await expect(resourceInput).toHaveValue('');
  const saved = (await (await request.get('/api/venues')).json()).find(
    (v: any) => v.id === venue.id,
  );
  expect(saved.layout.floors[0].resources[0].section).toBe('160');
  expect(
    saved.layout.floors[0].objects.some((o: any) => o.kind === 'label' && o.label === '160'),
  ).toBe(true);
});

test('admin sign-in supports retry, hides dismissed credentials and opens management', async ({
  page,
}) => {
  await page.goto('/');
  const openLogin = page.getByRole('button', { name: 'Admin sign in', exact: true });
  await openLogin.click();
  const password = page.getByLabel('Password', { exact: true });
  await expect(password).toBeFocused();
  await password.fill('incorrect-password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid password');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await openLogin.click();
  await expect(password).toHaveValue('');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await password.fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New venue', exact: true })).toBeVisible();
  await page.locator('.venue-list button').first().click();
  await expect(page.getByRole('button', { name: 'Edit layout', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
});

test('layout studio keeps the canvas stable and finds editable items by name', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'New venue' }).click();
  await page.getByLabel('Venue name').fill(`Editor UX ${Date.now()}`);
  await page.getByRole('button', { name: 'Create venue' }).click();
  await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
  const canvas = page.locator('.map-stage');
  const before = await canvas.boundingBox();
  await page.getByRole('button', { name: 'Select Table 1', exact: true }).click();
  await expect(page.getByLabel('Resource label')).toBeInViewport();
  await page.getByRole('button', { name: '+ plant', exact: true }).click();
  await expect(page.getByLabel('Object label')).toBeInViewport();
  await page.getByLabel('Object label').fill('Entrance fern');
  expect((await canvas.boundingBox())!.height).toBe(before!.height);
  await page.getByText(/Find an item ·/).click();
  await page.getByLabel('Search items').fill('Table 1');
  const picker = page.getByRole('combobox', { name: 'Scene item' });
  const table = await picker
    .locator('option')
    .filter({ hasText: 'Table 1 · table' })
    .getAttribute('value');
  await picker.selectOption(table!);
  await expect(page.getByLabel('Resource label')).toHaveValue('Table 1');
  await page.getByText('Floor settings', { exact: true }).click();
  await page.getByLabel('Floor name', { exact: true }).fill('Main dining room');
  const pricing = page.locator('details').filter({
    has: page.locator('summary', { hasText: /^Reservation pricing/ }),
  });
  if ((await pricing.getAttribute('open')) === null) await pricing.locator('summary').click();
  await page.getByRole('combobox', { name: 'Pricing mode' }).selectOption('uniform');
  await page.getByLabel('Standard reservation price').fill('12');
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
  await page.getByText('Floor settings', { exact: true }).click();
  await expect(page.getByLabel('Floor name', { exact: true })).toHaveValue('Main dining room');
  await page.screenshot({ path: '/tmp/openvenue-editor-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await pricing.locator('summary').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Save layout', exact: true })).toBeInViewport();
  await page.screenshot({ path: '/tmp/openvenue-editor-mobile.png', fullPage: true });
});

test('operator drags objects in both views and persists movement and deletion', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'New venue' }).click();
  const name = `Movement ${Date.now()}`;
  await page.getByLabel('Venue name').fill(name);
  await page.getByLabel('Starting layout').selectOption('empty');
  await page.getByRole('button', { name: 'Create venue' }).click();
  await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
  await page.getByRole('button', { name: '+ counter', exact: true }).click();
  const object = page.getByRole('button', { name: 'Select Counter', exact: true });
  const box = (await object.boundingBox())!;
  const x = page.getByLabel('x', { exact: true });
  const initial = Number(await x.inputValue());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(object).toHaveCSS('outline-style', 'none');
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await x.inputValue())).toBeGreaterThan(initial);
  const after2D = Number(await x.inputValue());
  await page.getByRole('button', { name: '3D view' }).click();
  await page.getByRole('button', { name: 'Top camera view' }).click();
  const canvas = page.locator('canvas');
  await page.waitForTimeout(600);
  // Locate the red X handle in the rendered canvas, then drag it with a real pointer.
  const png = (await canvas.screenshot()).toString('base64');
  const handle = await page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const bitmap = document.createElement('canvas');
    bitmap.width = image.width;
    bitmap.height = image.height;
    const context = bitmap.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const pixels: { x: number; y: number }[] = [];
    for (let y = 0; y < bitmap.height; y++)
      for (let x = 0; x < bitmap.width; x++) {
        const i = (y * bitmap.width + x) * 4;
        if (data[i] > 180 && data[i + 1] < 100 && data[i + 2] < 100) pixels.push({ x, y });
      }
    if (!pixels.length) throw new Error('Move arrow is not visible');
    pixels.sort((a, b) => b.x - a.x);
    return pixels[Math.min(10, pixels.length - 1)];
  }, png);
  const area = (await canvas.boundingBox())!;
  await page.mouse.move(area.x + handle.x, area.y + handle.y);
  await page.mouse.down();
  await page.mouse.move(area.x + handle.x + 35, area.y + handle.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await x.inputValue())).toBeGreaterThan(after2D);
  const moved = Number(await x.inputValue());
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  const saved = (await (await page.request.get('/api/venues')).json()).find(
    (v: any) => v.name === name,
  );
  expect(saved.layout.floors[0].objects[0].x).toBe(moved);
  await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
  await page.getByRole('button', { name: '3D view' }).click();
  await expect(page.getByRole('button', { name: 'Remove object' })).toBeInViewport();
  await page.getByRole('button', { name: 'Remove object' }).click();
  await expect(page.getByLabel('Object label')).toHaveCount(0);
  await page.getByRole('button', { name: '+ Add resource', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove resource' })).toBeInViewport();
  await page.getByRole('button', { name: 'Remove resource' }).click();
  await expect(page.getByLabel('Resource label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  await page.reload();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Select Counter', exact: true })).toHaveCount(0);
});

test('generated scenes are previewed before applying and saved only on explicit save', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'New venue' }).click();
  const name = `Generated preview ${Date.now()}`;
  await page.getByLabel('Venue name').fill(name);
  await page.getByLabel('Starting layout').selectOption('empty');
  await page.getByRole('button', { name: 'Create venue' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const venue = (await (await page.request.get('/api/venues')).json()).find(
    (v: any) => v.name === name,
  );
  await page.getByRole('button', { name: 'More venue actions' }).click();
  await page.getByRole('menuitem', { name: 'Generate with Claude' }).click();
  await page.getByRole('button', { name: 'Use example description' }).click();
  await page.getByRole('button', { name: 'Generate preview', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('ANTHROPIC_API_KEY');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const generated = makeTemplate('restaurant');
  generated.floors[0].name = 'AI dining room';
  await page.route('**/api/venues/*/generate-scene', (route) =>
    route.fulfill({ json: { summary: 'A dining room with clear aisles.', layout: generated } }),
  );
  await page.getByRole('button', { name: 'More venue actions' }).click();
  await page.getByRole('menuitem', { name: 'Generate with Claude' }).click();
  await page
    .getByLabel('Describe your scene')
    .fill('A restaurant with twelve tables and a counter');
  await page.getByRole('button', { name: 'Generate preview', exact: true }).click();
  await expect(page.getByText('A dining room with clear aisles.')).toBeVisible();
  const savedBefore = (await (await page.request.get('/api/venues')).json()).find(
    (v: any) => v.id === venue.id,
  );
  expect(savedBefore.layout.floors[0].resources).toHaveLength(0);
  await page.getByRole('button', { name: 'Use this layout' }).click();
  await expect(page.getByRole('button', { name: '3D view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  const stillSaved = (await (await page.request.get('/api/venues')).json()).find(
    (v: any) => v.id === venue.id,
  );
  expect(stillSaved.layout.floors[0].resources).toHaveLength(0);
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  const savedAfter = (await (await page.request.get('/api/venues')).json()).find(
    (v: any) => v.id === venue.id,
  );
  expect(savedAfter.layout.floors[0].name).toBe('AI dining room');
  expect(savedAfter.layout.floors[0].resources).toHaveLength(12);
});

test('operator prices a row and blocks and releases it for one event', async ({
  page,
  request,
}) => {
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  test.setTimeout(60000);
  const name = `Row controls ${Date.now()}`;
  const venue = await (
    await request.post('/api/venues', { data: { name, kind: 'stadium' } })
  ).json();
  const show = await (
    await request.post(`/api/venues/${venue.id}/shows`, {
      data: {
        title: 'Row control match',
        start: new Date(Date.now() + 86400000).toISOString(),
        end: new Date(Date.now() + 93600000).toISOString(),
      },
    })
  ).json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password').fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
  await page.getByRole('button', { name: 'Select North A1', exact: true }).click();
  await expect(page.getByLabel('Row label', { exact: true })).toHaveValue('A');
  await expect(page.getByLabel('Seat number', { exact: true })).toHaveValue('1');
  await page.getByLabel('Reservation price', { exact: true }).fill('35');
  await page.getByRole('button', { name: 'Apply price to this row' }).click();
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  const saved = (await (await request.get('/api/venues')).json()).find(
    (v: any) => v.id === venue.id,
  );
  expect(
    saved.layout.floors[0].resources
      .filter((r: any) => r.section === '60' && r.row === 'A')
      .map((r: any) => r.price),
  ).toEqual(Array(6).fill(3500));
  await page.getByRole('button', { name: 'Manage event seats', exact: true }).click();
  await page.getByLabel('Selection scope').selectOption('row');
  await page.getByRole('button', { name: 'Select North A1', exact: true }).click();
  await expect(page.getByText('6 seats selected', { exact: true })).toBeVisible();
  await page.getByLabel('Reason for blocking').fill('Camera platform');
  await page.getByRole('button', { name: 'Block selected seats', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('6 seats blocked');
  expect(
    await (await request.get(`/api/venues/${venue.id}/shows/${show.id}/blocks`)).json(),
  ).toHaveLength(6);
  await page.screenshot({ path: '/tmp/openvenue-seating-blocks-2d.png', fullPage: true });
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/openvenue-seating-blocks-3d.png', fullPage: true });
  await page.getByRole('button', { name: 'Release selected seats', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('6 seats released');
  expect(
    await (await request.get(`/api/venues/${venue.id}/shows/${show.id}/blocks`)).json(),
  ).toHaveLength(0);
  await request.post(`/api/venues/${venue.id}/shows/${show.id}/blocks`, {
    data: { resourceIds: [venue.layout.floors[0].resources[0].id], reason: 'Another operator' },
  });
  await expect(
    page.getByRole('button', { name: 'Release selected seats', exact: true }),
  ).toBeEnabled({ timeout: 20000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Reason for blocking')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '/tmp/openvenue-seating-mobile.png', fullPage: true });
});
