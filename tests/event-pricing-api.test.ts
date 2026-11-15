import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { createApp } from '../apps/api/src/app';

describe.skipIf(!process.env.TEST_DATABASE_URL)('event pricing API', () => {
  let app: INestApplication, base: string, cookie: string;
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const call = (
    path: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
    auth = true,
  ) =>
    fetch(base + '/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  beforeAll(async () => {
    app = await createApp({
      databaseUrl: process.env.TEST_DATABASE_URL!,
      adminPassword: 'integration-password-123',
      secureCookies: false,
    });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    const login = await call(
      '/auth/login',
      { password: 'integration-password-123' },
      'POST',
      false,
    );
    cookie = login.headers.get('set-cookie')!.split(';')[0];
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });
  async function fixture() {
    let venue = await (
      await call('/venues', { name: `Event pricing ${Date.now()}`, kind: 'cinema' })
    ).json();
    const tierId = crypto.randomUUID();
    venue.layout.pricing = {
      mode: 'tiers',
      currency: 'USD',
      amount: 100,
      tiers: [{ id: tierId, name: 'Standard', color: '#123456', amount: 5 }],
    };
    venue.layout.floors[0].resources.forEach((resource: any) => {
      resource.tierId = tierId;
    });
    venue = await (
      await call(
        `/venues/${venue.id}`,
        { name: venue.name, revision: venue.revision, layout: venue.layout },
        'PUT',
      )
    ).json();
    const shows: { id: string; start: string; end: string }[] = [];
    for (const year of [2090, 2091])
      shows.push(
        await (
          await call(`/venues/${venue.id}/shows`, {
            title: `Event ${year}`,
            start: `${year}-04-01T12:00:00Z`,
            end: `${year}-04-01T14:00:00Z`,
          })
        ).json(),
      );
    return { venue, tierId, shows, path: `/venues/${venue.id}/shows/${shows[0].id}/pricing` };
  }
  it('guards pricing, validates ownership and refuses invalid or overflowing prices', async () => {
    const { venue, tierId, shows, path } = await fixture();
    expect((await call(path, undefined, 'GET', false)).status).toBe(401);
    expect((await call(path, { multiplier: 1.3, overrides: [] }, 'PUT', false)).status).toBe(401);
    expect(await (await call(path)).json()).toEqual({ multiplier: 1, overrides: [] });
    for (const pricing of [
      { multiplier: 1.001, overrides: [] },
      { multiplier: 100, overrides: [] },
      { multiplier: 1, overrides: [{ tierId: crypto.randomUUID(), amount: 100 }] },
      { multiplier: 1, overrides: [{ tierId, amount: -1 }] },
    ])
      expect((await call(path, pricing, 'PUT')).status).toBe(400);
    expect((await call(`/venues/${crypto.randomUUID()}/shows/${shows[0].id}/pricing`)).status).toBe(
      404,
    );
    venue.layout.pricing.tiers[0].amount = 100000000;
    expect(
      (
        await call(
          `/venues/${venue.id}`,
          { name: venue.name, revision: venue.revision, layout: venue.layout },
          'PUT',
        )
      ).status,
    ).toBe(200);
    expect((await call(path, { multiplier: 1.01, overrides: [] }, 'PUT')).status).toBe(400);
    expect(await (await call(path)).json()).toEqual({ multiplier: 1, overrides: [] });
  });
  it('quotes and books rounded per-seat event prices, honors zero overrides, and keeps snapshots', async () => {
    const { venue, tierId, shows, path } = await fixture();
    expect((await call(path, { multiplier: 1.3, overrides: [] }, 'PUT')).status).toBe(200);
    const ids = venue.layout.floors[0].resources.slice(0, 3).map((r: any) => r.id);
    const query = new URLSearchParams({
      start: shows[0].start,
      end: shows[0].end,
      showId: shows[0].id,
    });
    const quote = await (
      await call(`/venues/${venue.id}/availability?${query}`, undefined, 'GET', false)
    ).json();
    expect(quote.prices[ids[0]]).toBe(7);
    expect(quote.currency).toBe('USD');
    const body = {
      venueId: venue.id,
      resourceId: ids[0],
      resourceIds: ids.slice(0, 2),
      partySize: 2,
      guestName: 'Two seats',
      showId: shows[0].id,
      expectedCurrency: 'USD',
    };
    expect((await call('/bookings', { ...body, expectedTotal: 13 }, 'POST', false)).status).toBe(
      409,
    );
    const booking = await call('/bookings', { ...body, expectedTotal: 14 }, 'POST', false);
    expect(booking.status).toBe(201);
    const saved = await booking.json();
    expect(saved.bookings.map((b: any) => b.price)).toEqual([7, 7]);
    const other = await call(
      '/bookings',
      { ...body, showId: shows[1].id, expectedTotal: 10 },
      'POST',
      false,
    );
    expect(other.status).toBe(201);
    expect((await other.json()).bookings.map((b: any) => b.price)).toEqual([5, 5]);
    expect(
      (await call(path, { multiplier: 1.5, overrides: [{ tierId, amount: 0 }] }, 'PUT')).status,
    ).toBe(200);
    const free = await call(
      '/bookings',
      { ...body, resourceId: ids[2], resourceIds: [ids[2]], partySize: 1, expectedTotal: 0 },
      'POST',
      false,
    );
    expect(free.status).toBe(201);
    expect((await free.json()).price).toBe(0);
    expect(
      (await pool.query('SELECT price FROM bookings WHERE id=$1', [saved.id])).rows[0].price,
    ).toBe(7);
    expect((await call(`/venues/${venue.id}/shows/${shows[0].id}/cancel`, {}, 'POST')).status).toBe(
      200,
    );
    expect(
      (
        await pool.query('SELECT count(*)::int AS count FROM show_prices WHERE show_id=$1', [
          shows[0].id,
        ])
      ).rows[0].count,
    ).toBe(0);
    expect(
      (await pool.query('SELECT price,status FROM bookings WHERE id=$1', [saved.id])).rows[0],
    ).toEqual({ price: 7, status: 'cancelled' });
  });
  it('rejects layout increases and tier unassignment that overflow an active event quote', async () => {
    const { venue, tierId, shows, path } = await fixture();
    const save = (layout: any, revision = venue.revision) =>
      call(`/venues/${venue.id}`, { name: venue.name, revision, layout }, 'PUT');
    venue.layout.pricing.tiers[0].amount = 50000000;
    const initial = await save(venue.layout);
    expect(initial.status).toBe(200);
    venue.revision = (await initial.json()).revision;
    expect((await call(path, { multiplier: 2, overrides: [] }, 'PUT')).status).toBe(200);
    for (const fallback of ['tier', 'resource', 'base']) {
      const proposed = structuredClone(venue.layout);
      if (fallback === 'tier') proposed.pricing.tiers[0].amount = 60000000;
      else {
        const seat = proposed.floors[0].resources[0];
        delete seat.tierId;
        if (fallback === 'resource') seat.price = 60000000;
        else {
          delete seat.price;
          proposed.pricing.amount = 60000000;
        }
      }
      expect((await save(proposed)).status).toBe(400);
      const persisted = (await (await call('/venues')).json()).find((v: any) => v.id === venue.id);
      expect(persisted.revision).toBe(venue.revision);
      expect(persisted.layout).toEqual(venue.layout);
      const quote = await call(
        `/venues/${venue.id}/availability?${new URLSearchParams({
          start: shows[0].start,
          end: shows[0].end,
          showId: shows[0].id,
        })}`,
      );
      expect(quote.status).toBe(200);
      expect((await quote.json()).prices[venue.layout.floors[0].resources[0].id]).toBe(100000000);
    }
    // A zero override protects the assigned tier, so a higher base remains valid.
    expect(
      (await call(path, { multiplier: 2, overrides: [{ tierId, amount: 0 }] }, 'PUT')).status,
    ).toBe(200);
    venue.layout.pricing.tiers[0].amount = 60000000;
    expect((await save(venue.layout)).status).toBe(200);
  });
  it('deletes an unbooked event with tier overrides', async () => {
    const { venue, tierId, shows, path } = await fixture();
    expect(
      (await call(path, { multiplier: 1, overrides: [{ tierId, amount: 123 }] }, 'PUT')).status,
    ).toBe(200);
    expect(
      (await call(`/venues/${venue.id}/shows/${shows[0].id}`, undefined, 'DELETE')).status,
    ).toBe(200);
  });
});
