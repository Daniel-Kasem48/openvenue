import { expect, test } from '@playwright/test';
test('operator creates a template, edits a map and manages a reservation', async ({ page }) => {
  const venueName = `Browser restaurant ${Date.now()}`;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your spaces, connected.' })).toBeVisible();
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
  await page.getByRole('button', { name: new RegExp(venueName) }).click();
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
  await page.getByRole('button', { name: /Central Parking/ }).click();
  await page.getByRole('button', { name: '2D view' }).click();
  await expect(page.getByLabel('Floor', { exact: true })).toHaveValue('0');
  await page.getByLabel('Floor', { exact: true }).selectOption('1');
  await expect(page.getByRole('button', { name: 'Select P2-01', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Studio Cinema/ }).click();
  await expect(page.getByLabel('Showtime')).toBeVisible();
});

test('workspace works on desktop and mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: /The Greenhouse/ }).click();
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
  await expect(page.getByRole('button', { name: '3D view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const [venue, resource, kind] of venues) {
    await page.getByRole('button', { name: new RegExp(venue) }).click();
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
