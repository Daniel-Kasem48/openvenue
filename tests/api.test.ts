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
  it('persists data in PostgreSQL', async () => {
    const result = await pool.query('SELECT name FROM venues WHERE id=$1', [venue.id]);
    expect(result.rows[0].name).toBe(venue.name);
  });
});
