import { randomUUID } from 'node:crypto';
import { makeTemplate, type Venue, type VenueKind } from '@openvenue/contracts';
import { expect, test } from './fixtures';

test('sidebar finds venues by name and kind and keeps the full selected name', async ({ page }) => {
  const kinds: VenueKind[] = ['restaurant', 'parking', 'cinema', 'stadium'];
  const venues: Venue[] = Array.from({ length: 50 }, (_, i) => ({
    id: randomUUID(),
    name: `Venue ${String(i).padStart(2, '0')} with a long descriptive name`,
    kind: kinds[i % 4],
    revision: 1,
    layout: makeTemplate('parking'),
  }));
  await page.route('**/api/venues', (route) => route.fulfill({ json: venues }));
  await page.route('**/api/venues/*/shows', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search venues' });
  await expect(search).toBeVisible();
  await search.fill('stadium');
  await expect(page.locator('.venue-list button')).toHaveCount(12);
  await search.fill('venue 49');
  const button = page
    .locator('.venue-list')
    .getByRole('button', { name: new RegExp(venues[49].name) });
  await expect(button).toHaveCount(1);
  await expect(button.locator('[title]')).toHaveAttribute('title', venues[49].name);
  await button.click();
  await expect(search).toHaveValue('');
  await expect(button).toBeInViewport();
  await expect(page.locator('.venue-list')).toContainText('Restaurants');
  await expect(page.locator('.venue-list')).toContainText('Parking');
  await expect(page.locator('.venue-list')).toContainText('Cinemas');
  await expect(page.locator('.venue-list')).toContainText('Stadiums');
});
