import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../apps/api/src/app';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('PostgreSQL reservation API', () => {
  let app: INestApplication, base: string, cookie: string, venue: any, resource: string;
  const pool = new Pool({ connectionString: databaseUrl });
  const request = (path: string, body?: unknown, admin = false, method = body ? 'POST' : 'GET') =>
    fetch(base + '/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(admin ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const interval = { start: '2090-01-01T12:00:00.000Z', end: '2090-01-01T13:00:00.000Z' };
  beforeAll(async () => {
    app = await createApp({
      databaseUrl: databaseUrl!,
      adminPassword: 'integration-password-123',
      secureCookies: false,
      publicOrigin: 'https://venue.example',
    });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    const login = await request('/auth/login', { password: 'integration-password-123' });
    expect(login.status).toBe(200);
    cookie = login.headers.get('set-cookie')!.split(';')[0];
    const created = await request(
      '/venues',
      { kind: 'restaurant', name: 'Integration restaurant' },
      true,
    );
    expect(created.status).toBe(201);
    venue = await created.json();
    resource = venue.layout.floors[0].resources[0].id;
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });
  it('protects admin data and rejects cross-origin mutations', async () => {
    expect((await request('/bookings')).status).toBe(401);
    expect((await request('/venues', { kind: 'parking', name: 'Unauthorized' })).status).toBe(401);
    const res = await fetch(base + '/api/bookings', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });
  it('protects scene generation and reports missing configuration without changing saved data', async () => {
    const path = `/venues/${venue.id}/generate-scene`;
    expect((await request(path, { prompt: 'A restaurant with six tables' })).status).toBe(401);
    expect((await request(path, { prompt: 'short' }, true)).status).toBe(400);
    const result = await request(path, { prompt: 'A restaurant with six tables' }, true);
    expect(result.status).toBe(503);
    expect((await result.json()).message).toContain('ANTHROPIC_API_KEY');
    const venues = await (await request('/venues')).json();
    expect(venues.find((item: any) => item.id === venue.id).layout).toEqual(venue.layout);
  });
  it('accepts the configured HTTPS origin behind a proxy', async () => {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: 'https://venue.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'integration-password-123' }),
    });
    expect(res.status).toBe(200);
  });
  it('rejects invalid booking data', async () => {
    expect(
      (
        await request('/bookings', {
          venueId: venue.id,
          resourceId: resource,
          guestName: ' ',
          ...interval,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/bookings', {
          venueId: venue.id,
          resourceId: resource,
          guestName: 'Guest',
          start: interval.end,
          end: interval.start,
        })
      ).status,
    ).toBe(400);
  });
  it('allows exactly one concurrent booking and releases it on cancellation', async () => {
    const body = {
      venueId: venue.id,
      resourceId: resource,
      guestName: 'Private Guest',
      ...interval,
    };
    const responses = await Promise.all([request('/bookings', body), request('/bookings', body)]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const booking = await responses.find((r) => r.status === 201)!.json();
    const available = await request(
      `/venues/${venue.id}/availability?start=${interval.start}&end=${interval.end}`,
    );
    const data = await available.json();
    expect(data.busy).toContain(resource);
    expect(JSON.stringify(data)).not.toContain('Private Guest');
    expect((await request(`/bookings/${booking.id}`, undefined, true, 'DELETE')).status).toBe(200);
    expect((await request('/bookings', body)).status).toBe(201);
    expect(
      (
        await request('/bookings', {
          ...body,
          start: interval.end,
          end: '2090-01-01T14:00:00.000Z',
        })
      ).status,
    ).toBe(201);
  });
  it('guards stale edits and resource removal with reservation history', async () => {
    const updated = await request(
      `/venues/${venue.id}`,
      { layout: venue.layout, revision: venue.revision, name: venue.name },
      true,
      'PUT',
    );
    expect(updated.status).toBe(200);
    expect(
      (
        await request(
          `/venues/${venue.id}`,
          { layout: venue.layout, revision: venue.revision, name: venue.name },
          true,
          'PUT',
        )
      ).status,
    ).toBe(409);
    const current = await updated.json();
    current.layout.floors[0].resources = current.layout.floors[0].resources.filter(
      (r: any) => r.id !== resource,
    );
    expect(
      (
        await request(
          `/venues/${venue.id}`,
          { layout: current.layout, revision: current.revision, name: current.name },
          true,
          'PUT',
        )
      ).status,
    ).toBe(409);
  });
  it('uses cinema show intervals and rejects missing shows', async () => {
    const cinema = await (
      await request('/venues', { kind: 'cinema', name: 'Integration cinema' }, true)
    ).json();
    const seat = cinema.layout.floors[0].resources[0].id;
    expect(
      (
        await request('/bookings', {
          venueId: cinema.id,
          resourceId: seat,
          guestName: 'Guest',
          ...interval,
        })
      ).status,
    ).toBe(400);
    const show = await (
      await request(`/venues/${cinema.id}/shows`, { title: 'Premiere', ...interval }, true)
    ).json();
    const booked = await request('/bookings', {
      venueId: cinema.id,
      resourceId: seat,
      guestName: 'Guest',
      showId: show.id,
    });
    expect(booked.status).toBe(201);
    expect((await booked.json()).start).toBe(interval.start);
  });
  it('rejects concurrent attempts to attach the same new resource to different venues', async () => {
    const first = await (
      await request('/venues', { kind: 'restaurant', name: 'Concurrent first' }, true)
    ).json();
    const second = await (
      await request('/venues', { kind: 'restaurant', name: 'Concurrent second' }, true)
    ).json();
    const sharedId = crypto.randomUUID();
    for (const v of [first, second])
      v.layout.floors[0].resources.push({ ...v.layout.floors[0].resources[0], id: sharedId });
    const results = await Promise.all(
      [first, second].map((v) =>
        request(
          `/venues/${v.id}`,
          { layout: v.layout, name: v.name, revision: v.revision },
          true,
          'PUT',
        ),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it('keeps scenery non-bookable', async () => {
    const objectId = venue.layout.floors[0].objects[0].id;
    expect(
      (
        await request('/bookings', {
          venueId: venue.id,
          resourceId: objectId,
          guestName: 'Guest',
          ...interval,
        })
      ).status,
    ).toBe(404);
  });
  it('persists data in PostgreSQL', async () => {
    const result = await pool.query('SELECT name FROM venues WHERE id=$1', [venue.id]);
    expect(result.rows[0].name).toBe(venue.name);
  });
  it('validates and persists restaurant party size', async () => {
    const v = await (
      await request('/venues', { kind: 'restaurant', name: 'Party size' }, true)
    ).json();
    const r = v.layout.floors[0].resources[0];
    const body = { venueId: v.id, resourceId: r.id, guestName: 'Party', ...interval };
    for (const partySize of [0, 1.5, r.capacity + 1])
      expect((await request('/bookings', { ...body, partySize })).status).toBe(400);
    const response = await request('/bookings', { ...body, partySize: r.capacity });
    expect(response.status).toBe(201);
    expect((await response.json()).partySize).toBe(r.capacity);
    const rows = await (await request('/bookings', undefined, true)).json();
    expect(rows.find((b: any) => b.venueId === v.id).partySize).toBe(r.capacity);
  });
  it('reserves cinema seats atomically and rejects duplicate or mismatched selections', async () => {
    const v = await (
      await request('/venues', { kind: 'cinema', name: 'Group seats' }, true)
    ).json();
    const show = await (
      await request(`/venues/${v.id}/shows`, { title: 'Group screening', ...interval }, true)
    ).json();
    const ids = v.layout.floors[0].resources.slice(0, 3).map((r: any) => r.id);
    const body = { venueId: v.id, resourceId: ids[0], guestName: 'Cinema group', showId: show.id };
    expect(
      (await request('/bookings', { ...body, resourceIds: [ids[0], ids[0]], partySize: 2 })).status,
    ).toBe(400);
    expect(
      (await request('/bookings', { ...body, resourceIds: ids.slice(0, 2), partySize: 3 })).status,
    ).toBe(400);
    expect((await request('/bookings', { ...body, resourceId: ids[1] })).status).toBe(201);
    expect(
      (await request('/bookings', { ...body, resourceIds: ids.slice(0, 2), partySize: 2 })).status,
    ).toBe(409);
    const available = await (
      await request(`/venues/${v.id}/availability?start=${interval.start}&end=${interval.end}`)
    ).json();
    expect(available.busy).not.toContain(ids[0]);
    const response = await request('/bookings', {
      ...body,
      resourceIds: [ids[0], ids[2]],
      partySize: 2,
    });
    expect(response.status).toBe(201);
    expect((await response.json()).bookings.map((b: any) => b.resourceId)).toEqual([
      ids[0],
      ids[2],
    ]);
  });
  it('uses configured prices, rejects stale quotes, and preserves booking prices', async () => {
    let v = await (
      await request('/venues', { kind: 'stadium', name: 'Priced stadium' }, true)
    ).json();
    const show = await (
      await request(`/venues/${v.id}/shows`, { title: 'Pricing event', ...interval }, true)
    ).json();
    const ids = v.layout.floors[0].resources.slice(0, 2).map((r: any) => r.id);
    const total = v.layout.floors[0].resources
      .slice(0, 2)
      .reduce((sum: number, r: any) => sum + r.price, 0);
    const body = {
      venueId: v.id,
      resourceId: ids[0],
      resourceIds: ids,
      partySize: 2,
      guestName: 'Quoted party',
      showId: show.id,
      expectedCurrency: 'USD',
    };
    expect((await request('/bookings', { ...body, expectedTotal: 1 })).status).toBe(409);
    const res = await request('/bookings', { ...body, expectedTotal: total });
    expect(res.status).toBe(201);
    const booked = await res.json();
    expect(booked.bookings.reduce((sum: number, b: any) => sum + b.price, 0)).toBe(total);
    v.layout.pricing = { mode: 'uniform', currency: 'EUR', amount: 1234 };
    v = await (
      await request(
        `/venues/${v.id}`,
        { layout: v.layout, name: v.name, revision: v.revision },
        true,
        'PUT',
      )
    ).json();
    const other = v.layout.floors[0].resources[2].id;
    const uniform = await request('/bookings', {
      venueId: v.id,
      resourceId: other,
      guestName: 'Uniform',
      showId: show.id,
      expectedTotal: 1234,
      expectedCurrency: 'EUR',
    });
    expect(uniform.status).toBe(201);
    expect((await uniform.json()).price).toBe(1234);
    const saved = await pool.query('SELECT price,currency FROM bookings WHERE id=$1', [booked.id]);
    expect(saved.rows[0]).toEqual({ price: total / 2, currency: 'USD' });
    v.layout.pricing.mode = 'free';
    await request(
      `/venues/${v.id}`,
      { layout: v.layout, name: v.name, revision: v.revision },
      true,
      'PUT',
    );
    const free = await request('/bookings', {
      venueId: v.id,
      resourceId: v.layout.floors[0].resources[3].id,
      guestName: 'Free',
      showId: show.id,
    });
    expect(free.status).toBe(201);
    expect((await free.json()).price).toBe(0);
  });
  it('creates empty scenes and persists arbitrary object changes without restoring the seed', async () => {
    const v = await (
      await request('/venues', { kind: 'stadium', name: 'Custom scene', empty: true }, true)
    ).json();
    expect(v.layout.floors).toHaveLength(1);
    expect(v.layout.floors[0].objects).toEqual([]);
    expect(v.layout.floors[0].resources).toEqual([]);
    v.layout.floors[0].width = 80;
    v.layout.floors[0].objects = [
      {
        id: crypto.randomUUID(),
        kind: 'pitch',
        label: 'My pitch',
        x: 40,
        y: 26,
        width: 30,
        depth: 20,
        height: 2,
        rotation: 15,
        color: '#123456',
      },
    ];
    expect(
      (
        await request(
          `/venues/${v.id}`,
          { layout: v.layout, name: v.name, revision: v.revision },
          true,
          'PUT',
        )
      ).status,
    ).toBe(200);
    const result = (await (await request('/venues')).json()).find((x: any) => x.id === v.id);
    expect(result.layout.floors[0]).toEqual(v.layout.floors[0]);
    result.layout.floors[0].objects = [];
    expect(
      (
        await request(
          `/venues/${v.id}`,
          { layout: result.layout, name: result.name, revision: result.revision },
          true,
          'PUT',
        )
      ).status,
    ).toBe(200);
    expect(
      (await pool.query('SELECT layout FROM venues WHERE id=$1', [v.id])).rows[0].layout.floors[0]
        .objects,
    ).toEqual([]);
  });
});
