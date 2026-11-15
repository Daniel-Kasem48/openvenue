import { expect, test } from './fixtures';

test('operator sets a custom event multiplier and guests pay different totals for two events', async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await request.post('/api/auth/login', { data: { password: 'integration-password-123' } });
  const name = `Event prices ${Date.now()}`;
  const venue = await (
    await request.post('/api/venues', { data: { name, kind: 'cinema' } })
  ).json();
  const tierId = crypto.randomUUID();
  venue.layout.pricing = {
    mode: 'tiers',
    currency: 'USD',
    amount: 1000,
    tiers: [{ id: tierId, name: 'Standard', color: '#557766', amount: 1000 }],
  };
  venue.layout.floors[0].resources.forEach((resource: any) => {
    resource.tierId = tierId;
  });
  expect(
    (
      await request.put(`/api/venues/${venue.id}`, {
        data: { name, revision: venue.revision, layout: venue.layout },
      })
    ).ok(),
  ).toBe(true);
  const shows: { id: string }[] = [];
  for (const year of [2090, 2091])
    shows.push(
      await (
        await request.post(`/api/venues/${venue.id}/shows`, {
          data: {
            title: `Event ${year}`,
            start: `${year}-05-01T12:00:00Z`,
            end: `${year}-05-01T14:00:00Z`,
          },
        })
      ).json(),
    );
  await page.goto('/');
  await page.getByRole('button', { name: 'Admin sign in', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('integration-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .locator('.venue-list')
    .getByRole('button', { name: `${name} Cinema`, exact: true })
    .click();
  await page.getByRole('button', { name: 'Manage event seats', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Pricing for this event', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '+25%', exact: true }).click();
  await expect(page.getByLabel('Event price multiplier', { exact: true })).toHaveValue('1.25');
  await page.getByLabel('Event price multiplier', { exact: true }).fill('1.30');
  await page.getByRole('button', { name: 'Save event prices', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Event prices saved');
  expect(
    (await (await request.get(`/api/venues/${venue.id}/shows/${shows[0].id}/pricing`)).json())
      .multiplier,
  ).toBe(1.3);
  await page.getByRole('button', { name: /Sign out/ }).click();
  for (const [index, amount] of [1300, 1000].entries()) {
    await page.getByRole('button', { name: `Book ${name} →`, exact: true }).click();
    let release = () => {};
    if (index === 1) {
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(`**/api/venues/${venue.id}/availability?*`, async (route) => {
        if (new URL(route.request().url()).searchParams.get('showId') === shows[1].id)
          await pending;
        await route.continue();
      });
    }
    await page.getByLabel('Showtime', { exact: true }).selectOption(shows[index].id);
    if (index === 1) {
      await expect(page.getByRole('button', { name: 'Choose a place' })).toBeDisabled();
      release();
    }
    await page.getByRole('button', { name: 'Choose a place' }).click();
    await page
      .getByRole('combobox', { name: 'Resource', exact: true })
      .selectOption(venue.layout.floors[0].resources[0].id);
    await expect(page.locator('.price-summary')).toContainText(index === 0 ? '$13.00' : '$10.00');
    await page.getByLabel('Colour by price').check();
    await expect(page.locator('.legend')).toContainText(index === 0 ? '$13.00' : '$10.00');
    await page.getByRole('button', { name: 'Review reservation →', exact: true }).click();
    await page.getByLabel('Guest name').fill(`Event guest ${index}`);
    const response = page.waitForResponse(
      (res) => res.url().endsWith('/api/bookings') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Confirm reservation' }).click();
    const booked = await response;
    expect(booked.status()).toBe(201);
    expect((await booked.json()).price).toBe(amount);
    await page.getByRole('button', { name: 'Book another visit' }).click();
  }
});
