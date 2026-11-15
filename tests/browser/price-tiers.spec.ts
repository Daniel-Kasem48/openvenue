import { expect, test } from './fixtures';

test('operator paints a block, persists tiers, and bookings use the saved tier amount', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const name = `Tier painting ${Date.now()}`;
  const venue = await (
    await request.post('/api/venues', { data: { name, kind: 'stadium' } })
  ).json();
  const floor = venue.layout.floors[0];
  const seat = floor.resources[0];
  const block = floor.resources.filter((r: any) => r.section === seat.section);
  const show = await (
    await request.post(`/api/venues/${venue.id}/shows`, {
      data: { title: 'Pricing test', start: '2090-01-01T12:00:00Z', end: '2090-01-01T14:00:00Z' },
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
  await expect(page.getByLabel('Pricing mode').locator('option[value=tiers]')).toHaveCount(1);
  await page.getByLabel('Pricing mode').selectOption('tiers');
  await page.getByRole('button', { name: 'Add price tier' }).click();
  await page.getByLabel('Tier 1 name').fill('Premium');
  await page.getByLabel('Tier 1 amount').fill('25');
  await page.getByLabel('Paint prices').check();
  await page.getByLabel('Paint scope').selectOption('block');
  await page.getByRole('button', { name: `Select ${seat.label}`, exact: true }).click();
  await expect(page.getByTestId('pricing-totals')).toContainText(`${block.length} assigned`);
  const seatBox = (await page
    .getByRole('button', { name: `Select ${seat.label}`, exact: true })
    .boundingBox())!;
  await page.mouse.move(seatBox.x + seatBox.width / 2, seatBox.y + seatBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(seatBox.x + 30, seatBox.y + 30, { steps: 5 });
  await page.mouse.up();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.locator('.legend')).toContainText('Premium');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  await page.reload();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  const saved = (await (await request.get('/api/venues')).json()).find(
    (v: any) => v.id === venue.id,
  );
  expect(saved.layout.floors[0].resources.filter((r: any) => r.tierId)).toHaveLength(block.length);
  expect(saved.layout.floors[0].resources[0].x).toBe(seat.x);
  expect(saved.layout.floors[0].resources[0].y).toBe(seat.y);
  await page.getByRole('button', { name: '2D view' }).click();
  await page.getByLabel('Colour by price').check();
  await expect(page.locator('.legend')).toContainText('Premium');
  const booking = await request.post('/api/bookings', {
    data: {
      venueId: venue.id,
      showId: show.id,
      resourceId: seat.id,
      guestName: 'Tier guest',
      expectedTotal: 2500,
      expectedCurrency: 'USD',
    },
  });
  expect(booking.status()).toBe(201);
  expect((await booking.json()).price).toBe(2500);
  await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Premium tier' }).click();
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  const cleared = (await (await request.get('/api/venues')).json()).find(
    (v: any) => v.id === venue.id,
  );
  expect(cleared.layout.floors[0].resources.some((r: any) => r.tierId)).toBe(false);
});

test('painting a 3D seat assigns its tier without moving or booking it', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const locations = new WeakMap<WebGLUniformLocation, string>();
    const proto = WebGL2RenderingContext.prototype;
    const get = proto.getUniformLocation;
    const set = proto.uniformMatrix4fv;
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
  const name = `3D tier ${Date.now()}`;
  const venue = await (
    await request.post('/api/venues', { data: { name, kind: 'cinema' } })
  ).json();
  const floor = venue.layout.floors[0];
  floor.objects = [];
  floor.resources = [
    {
      ...floor.resources[0],
      x: floor.width / 2,
      y: floor.depth / 2,
      width: 2,
      depth: 2,
      elevation: 0,
    },
  ];
  const tierId = crypto.randomUUID();
  venue.layout.pricing = {
    mode: 'tiers',
    currency: 'USD',
    amount: 0,
    tiers: [{ id: tierId, name: 'Premium', color: '#123abc', amount: 1500 }],
  };
  expect(
    (
      await request.put(`/api/venues/${venue.id}`, {
        data: { name, revision: venue.revision, layout: venue.layout },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password').fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(name) })
    .click();
  await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
  await page.getByLabel('Paint prices').check();
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await page.getByRole('button', { name: 'Top camera view', exact: true }).click();
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => (window as any).__cameraView?.length)).toBe(16);
  await page.waitForTimeout(700);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('pricing-totals')).toContainText('0 assigned · 1 unassigned');
  await page.getByRole('button', { name: 'Top camera view', exact: true }).click();
  await page.waitForTimeout(700);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('pricing-totals')).toContainText('1 assigned · 0 unassigned');
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  const saved = (await (await request.get('/api/venues')).json()).find(
    (v: any) => v.id === venue.id,
  ).layout.floors[0].resources[0];
  expect(saved.tierId).toBe(tierId);
  expect([saved.x, saved.y]).toEqual([floor.width / 2, floor.depth / 2]);
  const bookings = await (await request.get('/api/bookings')).json();
  expect(bookings.some((booking: any) => booking.venueId === venue.id)).toBe(false);
});
