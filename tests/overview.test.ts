import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createApp } from '../apps/api/src/app';
import type { INestApplication } from '@nestjs/common';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Operator overview', () => {
  let app: INestApplication, base: string, cookie: string;
  const pool = new Pool({ connectionString: databaseUrl });
  const from = '2181-01-01T00:00:00Z',
    to = '2181-01-31T00:00:00Z';
  const ids: string[] = [];
  const get = (query = `from=${from}&to=${to}`, admin = true) =>
    fetch(`${base}/api/overview?${query}`, { headers: admin ? { cookie } : {} });
  beforeAll(async () => {
    app = await createApp({
      databaseUrl: databaseUrl!,
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
    for (const id of ids) {
      await pool.query('DELETE FROM bookings WHERE venue_id=$1', [id]);
      await pool.query(
        'DELETE FROM event_seat_blocks WHERE show_id IN (SELECT id FROM shows WHERE venue_id=$1)',
        [id],
      );
      await pool.query('DELETE FROM shows WHERE venue_id=$1', [id]);
      await pool.query('DELETE FROM resources WHERE venue_id=$1', [id]);
      await pool.query('DELETE FROM venues WHERE id=$1', [id]);
    }
    await app?.close();
    await pool.end();
  });
  it('guards customer data and validates bounded date ranges independently of booking duration', async () => {
    expect((await get(undefined, false)).status).toBe(401);
    for (const query of [
      '',
      `from=${to}&to=${from}`,
      `from=${from}&to=2183-01-01T00:00:00Z`,
      `from=invalid&to=${to}`,
    ])
      expect((await get(query)).status).toBe(400);
    expect((await get()).status).toBe(200);
  });
  it('returns zero totals without bookings or events in the selected range', async () => {
    const data = await (await get()).json();
    expect(data.reservations).toBe(0);
    expect(data.placesBooked).toBe(0);
    expect(data.revenue).toEqual([]);
    expect(data.events).toEqual([]);
    expect(data.recent).toEqual([]);
    expect(data.seats).toEqual({ booked: 0, capacity: 0 });
  });
  it('excludes cancelled rows, groups currencies, and aggregates blocks separately from bookings', async () => {
    for (const [currency, price] of [
      ['USD', 1234],
      ['EUR', 5678],
    ] as const) {
      const venue = randomUUID(),
        show = randomUUID();
      ids.push(venue);
      await pool.query(
        "INSERT INTO venues(id,name,kind,layout) VALUES($1,'Overview cinema','cinema','{}')",
        [venue],
      );
      await pool.query(
        "INSERT INTO shows VALUES($1,$2,'Overview event','2181-01-02T12:00Z','2181-01-02T14:00Z')",
        [show, venue],
      );
      for (let i = 0; i < 5; i++) {
        const resource = randomUUID();
        await pool.query("INSERT INTO resources VALUES($1,$2,'Seat')", [resource, venue]);
        if (i < 3)
          await pool.query(
            "INSERT INTO bookings(id,venue_id,resource_id,guest_name,starts_at,ends_at,show_id,status,price,currency) VALUES($1,$2,$3,'Overview guest','2181-01-02T12:00Z','2181-01-02T14:00Z',$4,$5,$6,$7)",
            [
              randomUUID(),
              venue,
              resource,
              show,
              i === 2 ? 'cancelled' : 'confirmed',
              price,
              currency,
            ],
          );
        else
          await pool.query(
            "INSERT INTO event_seat_blocks(show_id,resource_id,reason) VALUES($1,$2,'Staff')",
            [show, resource],
          );
      }
    }
    const data = await (await get()).json();
    expect(data.reservations).toBe(4);
    expect(data.placesBooked).toBe(4);
    expect(data.revenue).toEqual([
      { currency: 'EUR', amount: 11356 },
      { currency: 'USD', amount: 2468 },
    ]);
    expect(data.seats).toEqual({ booked: 4, capacity: 6 });
    expect(data.events).toHaveLength(2);
    expect(data.events[0]).toMatchObject({ sold: 2, capacity: 3, blocked: 2 });
    expect(data.recent).toHaveLength(4);
  });
  it('counts a table once per reporting day while retaining all parties and using half-open boundaries', async () => {
    const venue = randomUUID(),
      resource = randomUUID();
    ids.push(venue);
    await pool.query(
      "INSERT INTO venues(id,name,kind,layout) VALUES($1,'Overview tables','restaurant','{}')",
      [venue],
    );
    await pool.query("INSERT INTO resources VALUES($1,$2,'Table')", [resource, venue]);
    for (const [start, end, party] of [
      ['2182-01-01T10:00Z', '2182-01-01T11:00Z', 3],
      ['2182-01-01T12:00Z', '2182-01-01T13:00Z', 4],
      ['2182-01-02T23:00Z', '2182-01-03T01:00Z', 2],
      ['2182-01-03T01:00Z', '2182-01-03T02:00Z', 5],
    ] as const) {
      await pool.query(
        "INSERT INTO bookings(id,venue_id,resource_id,guest_name,starts_at,ends_at,party_size) VALUES($1,$2,$3,'Table guest',$4,$5,$6)",
        [randomUUID(), venue, resource, start, end, party],
      );
    }
    const result = await get('from=2182-01-01T00:00:00Z&to=2182-01-03T00:00:00Z');
    expect(result.status).toBe(200);
    const data = await result.json();
    expect(data.reservations).toBe(3);
    expect(data.placesBooked).toBe(9);
    expect(data.resources.booked).toBe(2);
    const capacity = await pool.query(
      "SELECT count(*)::int AS total FROM resources r JOIN venues v ON v.id=r.venue_id WHERE v.kind NOT IN ('cinema','stadium')",
    );
    expect(data.resources.capacity).toBe(capacity.rows[0].total * 2);
  });
});
