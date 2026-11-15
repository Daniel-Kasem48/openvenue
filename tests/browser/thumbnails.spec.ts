import { makeTemplate, type Venue, type VenueKind } from '@openvenue/contracts';
import { expect, test } from './fixtures';

const kinds: VenueKind[] = ['restaurant', 'parking', 'cinema', 'stadium'];
function venues(): Venue[] {
  return Array.from({ length: 16 }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Preview ${i}`,
    kind: kinds[i % 4],
    layout: makeTemplate(kinds[i % 4]),
    revision: 1,
    ...(['cinema', 'stadium'].includes(kinds[i % 4])
      ? { nextEventAt: '2091-01-01T12:00:00.000Z' }
      : {}),
  }));
}

test('directory previews render 16 venues, report scripting time and retain booking actions', async ({
  page,
}) => {
  const data = venues();
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/venues', async (route) => {
    await ready;
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  await expect(page.getByText('Loading venues…')).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const before = await cdp.send('Performance.getMetrics');
  release();
  await expect(page.locator('.directory-card svg[aria-hidden="true"]')).toHaveCount(16);
  const after = await cdp.send('Performance.getMetrics');
  const duration = (metrics: typeof before) =>
    metrics.metrics.find((m) => m.name === 'ScriptDuration')!.value;
  const scriptingMs = (duration(after) - duration(before)) * 1000;
  console.log(`16 venue directory scripting: ${scriptingMs.toFixed(1)}ms`);
  if (process.env.THUMBNAIL_BENCHMARK) expect(scriptingMs).toBeLessThan(100);
  const stadium = page
    .locator('.directory-card')
    .filter({ has: page.getByRole('heading', { name: 'Preview 3', exact: true }) });
  await expect(stadium.locator('svg rect')).toHaveCount(
    data[3].layout.floors[0].resources.length +
      data[3].layout.floors[0].objects.filter((o) => o.kind !== 'plant').length,
  );
  await expect(stadium.locator('time')).toHaveAttribute('datetime', '2091-01-01T12:00:00.000Z');
  await expect(page.getByRole('button', { name: 'Book Preview 3 →', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('saved thumbnails and newly added event dates appear when returning to the directory', async ({
  page,
  request,
}) => {
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const venue = await (
    await request.post('/api/venues', {
      data: { kind: 'cinema', name: `Thumbnail edit ${Date.now()}` },
    })
  ).json();
  await request.post(`/api/venues/${venue.id}/shows`, {
    data: {
      title: 'Later event',
      start: '2091-01-01T12:00:00.000Z',
      end: '2091-01-01T14:00:00.000Z',
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(venue.name) })
    .click();
  await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
  await page.locator('.map-resource').first().click();
  await page.getByLabel('Seat color').fill('#123456');
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Layout saved');
  await page.getByRole('button', { name: /Browse venues/ }).click();
  const card = page
    .locator('.directory-card')
    .filter({ has: page.getByRole('heading', { name: venue.name, exact: true }) });
  await expect(card.locator('svg rect[fill="#123456"]')).toHaveCount(1);
  await expect(card.locator('time')).toHaveAttribute('datetime', '2091-01-01T12:00:00.000Z');
  await page.getByRole('button', { name: `Manage ${venue.name} →`, exact: true }).click();
  await page.getByRole('button', { name: '+ Add showtime', exact: true }).click();
  await page.getByLabel('Show title').fill('Earlier event');
  await page.getByLabel('Starts', { exact: true }).fill('2090-01-01T12:00');
  await page.getByLabel('Ends', { exact: true }).fill('2090-01-01T14:00');
  await page.getByRole('button', { name: 'Add showtime', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Showtime added');
  await page.getByRole('button', { name: /Browse venues/ }).click();
  await expect(card.locator('time')).toHaveAttribute('datetime', /2090-01-01T/);
});
