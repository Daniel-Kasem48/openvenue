import { expect, it } from 'vitest';
import { publicConfigSchema } from '@openvenue/contracts';
import { publicBookingRoute } from '../apps/web/src/booking/publicRoute';

it('recognizes only booking routes and validates venue and event identifiers', () => {
  const venueId = crypto.randomUUID(),
    showId = crypto.randomUUID();
  expect(publicBookingRoute({ pathname: '/', search: '' })).toBeUndefined();
  expect(publicBookingRoute({ pathname: '/bookkeeping', search: '' })).toBeUndefined();
  expect(
    publicBookingRoute({
      pathname: `/book/${venueId.toUpperCase()}`,
      search: `?show=${showId}&embed=1`,
    }),
  ).toEqual({ venueId, showId, embed: true });
  for (const [pathname, search] of [
    ['/book', ''],
    ['/book/no', ''],
    [`/book/${venueId}/admin`, ''],
    [`/book/${venueId}`, '?show='],
  ])
    expect(publicBookingRoute({ pathname, search })?.error).toBe('This booking link is invalid.');
});

it('accepts only HTTP sharing origins or the browser-origin fallback', () => {
  expect(publicConfigSchema.parse({ publicOrigin: null })).toEqual({ publicOrigin: null });
  expect(publicConfigSchema.safeParse({ publicOrigin: 'https://venue.example' }).success).toBe(
    true,
  );
  expect(publicConfigSchema.safeParse({ publicOrigin: 'javascript:alert(1)' }).success).toBe(false);
});
