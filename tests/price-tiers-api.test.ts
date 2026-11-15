import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../apps/api/src/app';

describe.skipIf(!process.env.TEST_DATABASE_URL)('saved tier booking prices', () => {
  let app: INestApplication, base: string, cookie: string;
  beforeAll(async () => {
    app = await createApp({
      databaseUrl: process.env.TEST_DATABASE_URL!,
      adminPassword: 'integration-password-123',
      secureCookies: false,
    });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'integration-password-123' }),
    });
    cookie = login.headers.get('set-cookie')!.split(';')[0];
  });
  afterAll(async () => {
    await app?.close();
  });
  const call = (path: string, body?: unknown, method = 'POST') =>
    fetch(base + '/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  it('charges zero tiers and fallback prices, rejects stale quotes and preserves booking snapshots after tier edits', async () => {
    let venue = await (
      await call('/venues', { kind: 'restaurant', name: `Tier API ${Date.now()}` })
    ).json();
    const tierId = crypto.randomUUID();
    venue.layout.pricing = {
      mode: 'tiers',
      currency: 'EUR',
      amount: 900,
      tiers: [{ id: tierId, name: 'Complimentary', color: '#123456', amount: 0 }],
    };
    const resources = venue.layout.floors[0].resources;
    resources[0].tierId = tierId;
    resources[0].price = 700;
    resources[1].price = 0;
    delete resources[2].price;
    resources[3].price = 700;
    const save = async () => {
      const response = await call(
        `/venues/${venue.id}`,
        { name: venue.name, revision: venue.revision, layout: venue.layout },
        'PUT',
      );
      expect(response.status).toBe(200);
      venue = await response.json();
    };
    await save();
    const body = {
      venueId: venue.id,
      guestName: 'Tier guest',
      start: '2090-03-01T12:00:00Z',
      end: '2090-03-01T13:00:00Z',
      expectedCurrency: 'EUR',
    };
    expect(
      (await call('/bookings', { ...body, resourceId: resources[0].id, expectedTotal: 700 }))
        .status,
    ).toBe(409);
    const bookings: { id: string; price: number }[] = [];
    for (const [index, amount] of [0, 0, 900, 700].entries()) {
      const response = await call('/bookings', {
        ...body,
        resourceId: resources[index].id,
        expectedTotal: amount,
      });
      expect(response.status).toBe(201);
      const booking = await response.json();
      expect(booking.price).toBe(amount);
      bookings.push(booking);
    }
    venue.layout.pricing.tiers[0].amount = 1500;
    await save();
    const saved = await (await call(`/bookings?venueId=${venue.id}`, undefined, 'GET')).json();
    expect(saved.items.find((booking: any) => booking.id === bookings[0].id).price).toBe(0);
  });
});
