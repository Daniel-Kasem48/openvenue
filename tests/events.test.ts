import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../apps/api/src/app';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Event management', () => {
  let app: INestApplication, base: string, cookie: string, venue: any;
  const pool = new Pool({ connectionString: databaseUrl });
  const request = (path: string, method = 'GET', body?: unknown, admin = true) =>
    fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(admin ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const event = (title: string, day = 1) => ({
    title,
    start: `2185-01-${String(day).padStart(2, '0')}T12:00:00Z`,
    end: `2185-01-${String(day).padStart(2, '0')}T14:00:00Z`,
  });
  const create = async (title: string, day = 1) => {
    const response = await request(`/venues/${venue.id}/shows`, 'POST', event(title, day));
    expect(response.status).toBe(201);
    return response.json();
  };
  const book = async (showId: string, index = 0) => {
    const response = await request(
      '/bookings',
      'POST',
      {
        venueId: venue.id,
        resourceId: venue.layout.floors[0].resources[index].id,
        showId,
        guestName: 'Event guest',
      },
      false,
    );
    expect(response.status).toBe(201);
    return response.json();
  };
  beforeAll(async () => {
    app = await createApp({
      databaseUrl: databaseUrl!,
      adminPassword: 'integration-password-123',
      secureCookies: false,
    });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    const login = await request('/auth/login', 'POST', { password: 'integration-password-123' });
    cookie = login.headers.get('set-cookie')!.split(';')[0];
    venue = await (
      await request('/venues', 'POST', { kind: 'cinema', name: 'Event management tests' })
    ).json();
  });
  afterAll(async () => {
    if (venue) {
      await pool.query('DELETE FROM bookings WHERE venue_id=$1', [venue.id]);
      await pool.query(
        'DELETE FROM event_seat_blocks WHERE show_id IN (SELECT id FROM shows WHERE venue_id=$1)',
        [venue.id],
      );
      await pool.query('DELETE FROM shows WHERE venue_id=$1', [venue.id]);
      await pool.query('DELETE FROM resources WHERE venue_id=$1', [venue.id]);
      await pool.query('DELETE FROM venues WHERE id=$1', [venue.id]);
    }
    await app?.close();
    await pool.end();
  });
  it('rejects a reviewed checkout after the event is rescheduled', async () => {
    const show = await create('Reviewed event', 15);
    const moved = event('Reviewed event', 16);
    expect((await request(`/venues/${venue.id}/shows/${show.id}`, 'PUT', moved)).status).toBe(200);
    const body = {
      venueId: venue.id,
      resourceId: venue.layout.floors[0].resources[0].id,
      showId: show.id,
      guestName: 'Review guest',
      start: show.start,
      end: show.end,
    };
    expect((await request('/bookings', 'POST', body, false)).status).toBe(409);
    expect(
      (await request('/bookings', 'POST', { ...body, start: moved.start, end: moved.end }, false))
        .status,
    ).toBe(201);
  });
  it('protects management routes and validates edits', async () => {
    const show = await create('Guarded', 10),
      path = `/venues/${venue.id}/shows/${show.id}`;
    for (const [url, method, body] of [
      [`/venues/${venue.id}/events`, 'GET'],
      [path, 'PUT', event('Denied')],
      [path, 'DELETE'],
      [path + '/cancel', 'POST'],
    ] as const)
      expect((await request(url, method, body, false)).status).toBe(401);
    expect((await request(path, 'PUT', { ...event(''), end: '2185-01-01T11:00:00Z' })).status).toBe(
      400,
    );
    expect(
      (await request(`/venues/${randomUUID()}/shows/${show.id}`, 'PUT', event('Wrong venue')))
        .status,
    ).toBe(404);
    expect((await request(path, 'PUT', event('Renamed', 10))).status).toBe(200);
    const list = await (await request(`/venues/${venue.id}/events`)).json();
    expect(list.find((row: any) => row.id === show.id)).toMatchObject({
      title: 'Renamed',
      sold: 0,
      capacity: 48,
      blocked: 0,
    });
    expect((await request(path, 'DELETE')).status).toBe(200);
  });
  it('moves confirmed bookings atomically and rolls back an overlapping reschedule', async () => {
    const first = await create('Original'),
      second = await create('Conflict', 2);
    const booking = await book(first.id),
      cancelled = await book(first.id, 1),
      extra = await book(first.id, 3);
    await request(`/bookings/${cancelled.id}`, 'DELETE');
    await book(second.id);
    const path = `/venues/${venue.id}/shows/${first.id}`;
    expect((await request(path, 'PUT', event('Should roll back', 2))).status).toBe(409);
    const saved = (await pool.query('SELECT title,starts_at FROM shows WHERE id=$1', [first.id]))
      .rows[0];
    expect(saved.title).toBe('Original');
    expect(saved.starts_at.toISOString()).toBe('2185-01-01T12:00:00.000Z');
    expect(
      (
        await pool.query('SELECT starts_at FROM bookings WHERE id=$1', [booking.id])
      ).rows[0].starts_at.toISOString(),
    ).toBe('2185-01-01T12:00:00.000Z');
    expect((await request(path, 'PUT', event('Moved', 3))).status).toBe(200);
    const rows = (
      await pool.query('SELECT id,starts_at,event_title FROM bookings WHERE id=ANY($1::uuid[])', [
        [booking.id, cancelled.id],
      ])
    ).rows;
    expect(rows.find((row) => row.id === booking.id).starts_at.toISOString()).toBe(
      '2185-01-03T12:00:00.000Z',
    );
    expect(rows.find((row) => row.id === cancelled.id).starts_at.toISOString()).toBe(
      '2185-01-01T12:00:00.000Z',
    );
    expect(rows.find((row) => row.id === booking.id).event_title).toBe('Original');
    const denied = await request(path, 'DELETE');
    expect(denied.status).toBe(409);
    expect((await denied.json()).message).toContain('confirmed');
    await request(path + '/blocks', 'POST', {
      resourceIds: [venue.layout.floors[0].resources[2].id],
      reason: 'Staff',
    });
    expect((await request(path + '/cancel', 'POST')).status).toBe(200);
    const history = (
      await pool.query('SELECT status,show_id,event_title FROM bookings WHERE id=ANY($1::uuid[])', [
        [booking.id, cancelled.id, extra.id],
      ])
    ).rows;
    expect(history).toHaveLength(3);
    expect(
      history.every(
        (row) =>
          row.status === 'cancelled' && row.show_id === null && row.event_title === 'Original',
      ),
    ).toBe(true);
    expect((await pool.query('SELECT * FROM shows WHERE id=$1', [first.id])).rowCount).toBe(0);
    expect(
      (await pool.query('SELECT * FROM event_seat_blocks WHERE show_id=$1', [first.id])).rowCount,
    ).toBe(0);
  });
  it('allows title-only edits to started events and preserves cancelled history on ordinary deletion', async () => {
    const show = await create('Past title', 20),
      booking = await book(show.id);
    await request(`/bookings/${booking.id}`, 'DELETE');
    await pool.query(
      "UPDATE shows SET starts_at='2020-01-01T12:00Z',ends_at='2020-01-01T14:00Z' WHERE id=$1",
      [show.id],
    );
    const path = `/venues/${venue.id}/shows/${show.id}`;
    expect(
      (
        await request(path, 'PUT', {
          title: 'Past renamed',
          start: '2020-01-01T12:00:00Z',
          end: '2020-01-01T14:00:00Z',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(path, 'PUT', {
          title: 'Past moved',
          start: '2020-01-02T12:00:00Z',
          end: '2020-01-02T14:00:00Z',
        })
      ).status,
    ).toBe(400);
    expect((await request(path, 'DELETE')).status).toBe(200);
    expect(
      (await pool.query('SELECT event_title,show_id FROM bookings WHERE id=$1', [booking.id]))
        .rows[0],
    ).toEqual({ event_title: 'Past title', show_id: null });
  });
  it('serializes cancellation with concurrent checkout without losing history', async () => {
    const show = await create('Concurrent cancellation', 25);
    const [booking, cancellation] = await Promise.all([
      request(
        '/bookings',
        'POST',
        {
          venueId: venue.id,
          resourceId: venue.layout.floors[0].resources[0].id,
          showId: show.id,
          guestName: 'Concurrent guest',
        },
        false,
      ),
      request(`/venues/${venue.id}/shows/${show.id}/cancel`, 'POST'),
    ]);
    expect(cancellation.status).toBe(200);
    expect([201, 400]).toContain(booking.status);
    if (booking.status === 201) {
      const created = await booking.json();
      expect(
        (
          await pool.query('SELECT status,show_id,event_title FROM bookings WHERE id=$1', [
            created.id,
          ])
        ).rows[0],
      ).toEqual({ status: 'cancelled', show_id: null, event_title: 'Concurrent cancellation' });
    }
    expect((await pool.query('SELECT * FROM shows WHERE id=$1', [show.id])).rowCount).toBe(0);
  });
});
