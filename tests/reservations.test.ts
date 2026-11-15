import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { bookingsCsv, csvCell } from '../apps/api/src/bookings/booking-response';
import { createApp } from '../apps/api/src/app';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Reservation operations', () => {
  let app: INestApplication, base: string, cookie: string, venue: any, cinema: any;
  const pool = new Pool({ connectionString: databaseUrl });
  const call = (path: string, method = 'GET', body?: unknown, admin = true) =>
    fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(admin ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const body = (index = 0, guestName = 'Contact guest') => ({
    venueId: venue.id,
    resourceId: venue.layout.floors[0].resources[index].id,
    guestName,
    start: '2190-01-01T12:00:00Z',
    end: '2190-01-01T13:00:00Z',
  });
  const book = async (index: number, guestName: string, extra = {}) => {
    const response = await call(
      '/bookings',
      'POST',
      { ...body(index, guestName), ...extra },
      false,
    );
    expect(response.status).toBe(201);
    return response.json();
  };
  const list = async (query = '') => {
    const response = await call(`/bookings?venueId=${venue.id}&${query}`);
    expect(response.status).toBe(200);
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
    const login = await call('/auth/login', 'POST', { password: 'integration-password-123' });
    cookie = login.headers.get('set-cookie')!.split(';')[0];
    venue = await (
      await call('/venues', 'POST', { kind: 'restaurant', name: 'Reservation operations' })
    ).json();
    cinema = await (
      await call('/venues', 'POST', { kind: 'cinema', name: 'Reservation event operations' })
    ).json();
  });
  afterAll(async () => {
    for (const item of [venue, cinema].filter(Boolean)) {
      await pool.query('DELETE FROM bookings WHERE venue_id=$1', [item.id]);
      await pool.query(
        'DELETE FROM event_seat_blocks WHERE show_id IN (SELECT id FROM shows WHERE venue_id=$1)',
        [item.id],
      );
      await pool.query('DELETE FROM shows WHERE venue_id=$1', [item.id]);
      await pool.query('DELETE FROM resources WHERE venue_id=$1', [item.id]);
      await pool.query('DELETE FROM venues WHERE id=$1', [item.id]);
    }
    await app?.close();
    await pool.end();
  });
  it('validates contact data and keeps contacts and notes out of public responses', async () => {
    const invalid = 'private-contact-invalid-email';
    const rejected = await call('/bookings', 'POST', { ...body(), guestEmail: invalid }, false);
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).not.toContain(invalid);
    const booking = await book(0, 'Literal %_ guest', {
      guestEmail: 'private@example.test',
      guestPhone: '+49 30 12345',
      notes: 'Do not accept guest notes',
    });
    expect(booking).not.toHaveProperty('guestEmail');
    expect(booking).not.toHaveProperty('guestPhone');
    expect(booking).not.toHaveProperty('notes');
    const result = await list('q=private%40example.test');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      guestEmail: 'private@example.test',
      guestPhone: '+49 30 12345',
      notes: '',
    });
    expect(
      (await call(`/bookings/${booking.id}`, 'PATCH', { notes: 'Denied' }, false)).status,
    ).toBe(401);
    expect((await call('/bookings.csv', 'GET', undefined, false)).status).toBe(401);
    expect((await call('/bookings', 'GET', undefined, false)).status).toBe(401);
    const availability = await call(
      `/venues/${venue.id}/availability?start=2190-01-01T12:00:00Z&end=2190-01-01T13:00:00Z`,
      'GET',
      undefined,
      false,
    );
    expect(await availability.text()).not.toContain('private@example.test');
  });
  it('filters literal substrings, dates, event and status, with validated keyset pagination', async () => {
    for (let index = 1; index <= 3; index++) await book(index, `Paging guest ${index}`);
    await pool.query(
      "UPDATE bookings SET starts_at=starts_at+interval '0.000001 seconds' WHERE venue_id=$1 AND guest_name='Paging guest 2'",
      [venue.id],
    );
    expect((await list('q=%25_')).items).toHaveLength(1);
    expect((await list('from=2190-01-02T00:00:00Z')).items).toHaveLength(0);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await list(
        `q=Paging&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      expect(page.items).toHaveLength(1);
      expect(seen).not.toContain(page.items[0].id);
      seen.push(page.items[0].id);
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(3);
    for (const query of [
      'limit=101',
      'cursor=invalid',
      'from=2191-01-01T00:00:00Z&to=2190-01-01T00:00:00Z',
      'status=unknown',
    ])
      expect((await call('/bookings?' + query)).status).toBe(400);
    const show = await (
      await call(`/venues/${cinema.id}/shows`, 'POST', {
        title: 'Filter event',
        start: '2190-02-01T12:00:00Z',
        end: '2190-02-01T14:00:00Z',
      })
    ).json();
    const reservation = await (
      await call('/bookings', 'POST', {
        venueId: cinema.id,
        resourceId: cinema.layout.floors[0].resources[0].id,
        showId: show.id,
        guestName: 'Event guest',
      })
    ).json();
    const filtered = await (await call(`/bookings?showId=${show.id}`)).json();
    expect(filtered.items.map((row: any) => row.id)).toEqual([reservation.id]);
  });
  it('supports notes and check-in/undo, clears arrival on terminal states and releases availability', async () => {
    const booking = await book(4, 'Arrival guest');
    let response = await call(`/bookings/${booking.id}`, 'PATCH', {
      notes: 'Private staff note',
      checkedIn: true,
    });
    expect(response.status).toBe(200);
    let updated = await response.json();
    expect(updated.checkedInAt).toBeTruthy();
    expect(updated.notes).toBe('Private staff note');
    response = await call(`/bookings/${booking.id}`, 'PATCH', { checkedIn: false });
    expect((await response.json()).checkedInAt).toBeNull();
    await call(`/bookings/${booking.id}`, 'PATCH', { checkedIn: true });
    response = await call(`/bookings/${booking.id}`, 'PATCH', { status: 'no_show' });
    updated = await response.json();
    expect(updated).toMatchObject({ status: 'no_show', checkedInAt: null });
    expect((await call(`/bookings/${booking.id}`, 'PATCH', { checkedIn: true })).status).toBe(409);
    expect((await list('status=no_show')).items.map((row: any) => row.id)).toContain(booking.id);
    const replacement = await book(4, 'Replacement guest');
    expect((await call('/bookings', 'POST', body(4), false)).status).toBe(409);
    await call(`/bookings/${replacement.id}`, 'PATCH', { checkedIn: true });
    expect((await call(`/bookings/${replacement.id}`, 'DELETE')).status).toBe(200);
    expect((await list(`status=cancelled&q=${replacement.id}`)).items[0].checkedInAt).toBeNull();
    expect((await call(`/bookings/${booking.id}`, 'PATCH', {})).status).toBe(400);
    expect((await call(`/bookings/${booking.id}`, 'PATCH', { status: 'confirmed' })).status).toBe(
      400,
    );
  });
  it('exports every matching row with BOM, quoted newlines and neutralized spreadsheet formulas', async () => {
    const first = await book(5, 'CSV, "Guest"', {
      guestEmail: 'csv@example.test',
      guestPhone: '+49 30 999',
    });
    await book(6, 'CSV second');
    await call(`/bookings/${first.id}`, 'PATCH', { notes: '=SUM(1,2)\n"private"' });
    const response = await call(`/bookings.csv?venueId=${venue.id}&q=CSV&limit=1`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('"CSV, ""Guest"""');
    expect(text).toContain('"CSV second"');
    expect(text).toContain('"\'=SUM(1,2)\n""private"""');
    expect(text).toContain('"\'+49 30 999"');
    expect(text).not.toContain('Literal %_ guest');
  });
  it('event cancellation clears check-in while retaining private history', async () => {
    const show = await (
      await call(`/venues/${cinema.id}/shows`, 'POST', {
        title: 'Cancel arrivals',
        start: '2190-03-01T12:00:00Z',
        end: '2190-03-01T14:00:00Z',
      })
    ).json();
    const booking = await (
      await call('/bookings', 'POST', {
        venueId: cinema.id,
        resourceId: cinema.layout.floors[0].resources[0].id,
        showId: show.id,
        guestName: 'Arrived event guest',
      })
    ).json();
    await call(`/bookings/${booking.id}`, 'PATCH', { checkedIn: true, notes: 'Retained note' });
    expect((await call(`/venues/${cinema.id}/shows/${show.id}/cancel`, 'POST')).status).toBe(200);
    expect(
      (
        await pool.query('SELECT status,checked_in_at,notes FROM bookings WHERE id=$1', [
          booking.id,
        ])
      ).rows[0],
    ).toEqual({ status: 'cancelled', checked_in_at: null, notes: 'Retained note' });
  });
});

describe('CSV field safety', () => {
  it('exports saved resource locations after later layout renames, with a legacy fallback', () => {
    const csv = bookingsCsv([
      { seatLocation: 'Booked seat A1', resourceLabel: 'Renamed seat' },
      { seatLocation: null, resourceLabel: 'Legacy resource' },
    ]);
    expect(csv).toContain('Booked seat A1');
    expect(csv).not.toContain('Renamed seat');
    expect(csv).toContain('Legacy resource');
  });
  it.each(['-1+2', '@SUM(A1:A2)', ' \t=1', '\r\n=1'])('neutralizes formula prefix %j', (value) => {
    expect(csvCell(value)).toBe('"\'' + value + '"');
  });
});
