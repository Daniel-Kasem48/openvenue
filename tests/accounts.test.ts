import 'dotenv/config';
import { expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../apps/api/src/auth';

it('hashes account passwords with separate salts and safely rejects invalid credentials', async () => {
  const password = 'correct horse battery staple';
  const first = await hashPassword(password),
    second = await hashPassword(password);
  expect(first).not.toBe(second);
  expect(first).not.toContain(password);
  expect(await verifyPassword(password, first)).toBe(true);
  expect(await verifyPassword('wrong password', first)).toBe(false);
  expect(await verifyPassword(password, 'broken')).toBe(false);
  expect(await verifyPassword(password, 'ff:ff')).toBe(false);
});

import { afterAll, beforeAll, describe } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/api/src/app';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Staff accounts and authorization', () => {
  let app: INestApplication, base: string;
  const pool = new Pool({ connectionString: databaseUrl });
  const cookies: Record<string, string> = {};
  const users: Record<string, any> = {};
  const password = 'account-password-123';
  const request = (path: string, method = 'GET', body?: unknown, role = 'owner') =>
    fetch(base + '/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookies[role] ? { cookie: cookies[role] } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  beforeAll(async () => {
    app = await createApp({
      databaseUrl: databaseUrl!,
      adminPassword: 'integration-password-123',
      secureCookies: false,
    });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    for (const role of ['owner', 'legacy']) {
      const login = await request(
        '/auth/login',
        'POST',
        { password: 'integration-password-123' },
        'guest',
      );
      expect(login.status).toBe(200);
      cookies[role] = login.headers.get('set-cookie')!.split(';')[0];
    }
    expect(await (await request('/auth/me')).json()).toMatchObject({
      bootstrap: true,
      role: 'owner',
    });
    expect(
      (
        await request('/users', 'POST', {
          email: 'invalid-first@example.test',
          name: 'Invalid first',
          password,
          role: 'manager',
        })
      ).status,
    ).toBe(400);
    const originalCookies = [cookies.owner, cookies.legacy];
    const firstOwners = await Promise.all(
      ['owner', 'legacy'].map((role) =>
        request(
          '/users',
          'POST',
          { email: `owner-${randomUUID()}@example.test`, name: 'owner', password, role: 'owner' },
          role,
        ),
      ),
    );
    for (let i = 0; i < firstOwners.length; i++)
      if (firstOwners[i].status === 201) users[`bootstrap${i}`] = await firstOwners[i].json();
    expect(firstOwners.map((response) => response.status).sort()).toEqual([201, 401]);
    const winner = firstOwners.findIndex((response) => response.status === 201);
    users.owner = users[`bootstrap${winner}`];
    cookies.owner = originalCookies[winner];
    cookies.legacy = originalCookies[1 - winner];
    for (const role of ['manager', 'staff']) {
      const created = await request('/users', 'POST', {
        email: `${role}-${randomUUID()}@example.test`,
        name: role,
        password,
        role,
      });
      expect(created.status).toBe(201);
      users[role] = await created.json();
      expect(users[role]).not.toHaveProperty('password_hash');
      if (role !== 'owner') {
        const login = await request(
          '/auth/login',
          'POST',
          { email: users[role].email, password },
          'guest',
        );
        expect(login.status).toBe(200);
        cookies[role] = login.headers.get('set-cookie')!.split(';')[0];
      }
    }
  });
  afterAll(async () => {
    const ids = Object.values(users).map((u) => u.id);
    if (ids.length) {
      await pool.query('DELETE FROM audit_log WHERE user_id=ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM sessions WHERE user_id=ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ids]);
    }
    await app?.close();
    await pool.end();
  });
  it('upgrades the bootstrap session and permanently closes shared-password access once accounts exist', async () => {
    expect(await (await request('/auth/me')).json()).toMatchObject({
      bootstrap: false,
      role: 'owner',
      user: { id: users.owner.id, name: 'owner' },
    });
    expect((await request('/auth/me', 'GET', undefined, 'legacy')).status).toBe(401);
    expect(
      (await request('/auth/login', 'POST', { password: 'integration-password-123' }, 'guest'))
        .status,
    ).toBe(401);
    expect(
      (
        await request(
          '/auth/login',
          'POST',
          { email: users.owner.email, password: 'wrong-password-123' },
          'guest',
        )
      ).status,
    ).toBe(401);
    const listed = await (await request('/users')).json();
    expect(listed.length).toBe(3);
    expect(JSON.stringify(listed)).not.toContain('password');
  });
  it('checks operational and owner permissions on every guarded route', async () => {
    expect((await request('/users/not-a-uuid', 'PATCH', { disabled: true })).status).toBe(400);
    const id = randomUUID();
    const routes: [string, string, unknown?][] = [
      ['/venues?includeArchived=1', 'GET'],
      ['/venues', 'POST', {}],
      [`/venues/${id}`, 'PUT', {}],
      [`/venues/${id}`, 'PATCH', {}],
      [`/venues/${id}/generate-scene`, 'POST', {}],
      [`/venues/${id}/shows`, 'POST', {}],
      [`/venues/${id}/events`, 'GET'],
      [`/venues/${id}/shows/${id}`, 'PUT', {}],
      [`/venues/${id}/shows/${id}`, 'DELETE'],
      [`/venues/${id}/shows/${id}/cancel`, 'POST'],
      [`/venues/${id}/shows/${id}/blocks`, 'GET'],
      [`/venues/${id}/shows/${id}/blocks`, 'POST', {}],
      [`/venues/${id}/shows/${id}/blocks`, 'DELETE', {}],
      [`/venues/${id}/shows/${id}/pricing`, 'GET'],
      [`/venues/${id}/shows/${id}/pricing`, 'PUT', {}],
      ['/overview', 'GET'],
      [`/bookings/${id}`, 'DELETE'],
    ];
    for (const [path, method, body] of routes) {
      expect((await request(path, method, body, 'guest')).status, `${method} ${path} guest`).toBe(
        401,
      );
      expect((await request(path, method, body, 'staff')).status, `${method} ${path} staff`).toBe(
        403,
      );
      for (const role of ['owner', 'manager'])
        expect([401, 403]).not.toContain((await request(path, method, body, role)).status);
    }
    for (const path of ['/bookings', '/bookings.csv', '/auth/me']) {
      expect((await request(path, 'GET', undefined, 'guest')).status).toBe(401);
      for (const role of ['owner', 'manager', 'staff'])
        expect((await request(path, 'GET', undefined, role)).status).toBe(200);
    }
    expect((await request(`/bookings/${id}`, 'PATCH', { checkedIn: true }, 'guest')).status).toBe(
      401,
    );
    for (const role of ['manager', 'staff'])
      for (const [path, method, body] of [
        ['/users', 'GET'],
        ['/users', 'POST', {}],
        [`/users/${users.staff.id}`, 'PATCH', { role: 'owner' }],
      ] as const)
        expect((await request(path, method, body, role)).status).toBe(403);
  });
  it('records layout and pricing edits with the actor in the same transaction', async () => {
    const venue = await (
      await request('/venues', 'POST', { kind: 'parking', name: 'Audited parking' }, 'manager')
    ).json();
    venue.layout.pricing = { mode: 'uniform', currency: 'EUR', amount: 1250 };
    expect(
      (
        await request(
          `/venues/${venue.id}`,
          'PUT',
          { name: venue.name, layout: venue.layout, revision: venue.revision },
          'manager',
        )
      ).status,
    ).toBe(200);
    const rows = (
      await pool.query('SELECT user_id,action FROM audit_log WHERE entity_id=$1 ORDER BY action', [
        venue.id,
      ])
    ).rows;
    expect(rows).toEqual([
      { user_id: users.manager.id, action: 'layout.saved' },
      { user_id: users.manager.id, action: 'pricing.changed' },
    ]);
    expect(
      (
        await request(
          `/venues/${venue.id}`,
          'PUT',
          { name: venue.name, layout: venue.layout, revision: venue.revision },
          'manager',
        )
      ).status,
    ).toBe(409);
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM audit_log WHERE entity_id=$1', [venue.id]))
        .rows[0].n,
    ).toBe(2);
  });
  it('keeps the cancelling operator in the audit trail after an event is deleted', async () => {
    const venue = await (
      await request('/venues', 'POST', { kind: 'cinema', name: 'Audited event' })
    ).json();
    const show = await (
      await request(`/venues/${venue.id}/shows`, 'POST', {
        title: 'Audited show',
        start: '2188-01-01T12:00:00Z',
        end: '2188-01-01T14:00:00Z',
      })
    ).json();
    expect(
      (
        await request(
          '/bookings',
          'POST',
          {
            venueId: venue.id,
            showId: show.id,
            resourceId: venue.layout.floors[0].resources[0].id,
            guestName: 'Audit guest',
          },
          'guest',
        )
      ).status,
    ).toBe(201);
    expect(
      (await request(`/venues/${venue.id}/shows/${show.id}/cancel`, 'POST', undefined, 'manager'))
        .status,
    ).toBe(200);
    expect(
      (await pool.query('SELECT user_id,action FROM audit_log WHERE entity_id=$1', [show.id])).rows,
    ).toEqual([{ user_id: users.manager.id, action: 'event.cancelled' }]);
  });
  it('allows staff check-in only and audits booking cancellation once with its actor', async () => {
    const venue = await (
      await request('/venues', 'POST', { kind: 'parking', name: 'Door permissions' })
    ).json();
    const booked = await request(
      '/bookings',
      'POST',
      {
        venueId: venue.id,
        resourceId: venue.layout.floors[0].resources[0].id,
        start: '2188-01-01T12:00:00Z',
        end: '2188-01-01T14:00:00Z',
        guestName: 'Private guest',
        guestEmail: 'private@example.test',
      },
      'guest',
    );
    expect(booked.status).toBe(201);
    const booking = await booked.json();
    const path = `/bookings/${booking.id}`;
    for (const body of [
      { notes: 'Denied' },
      { status: 'no_show' },
      { status: 'cancelled' },
      { checkedIn: true, notes: 'Denied' },
      { checkedIn: false, status: 'cancelled' },
    ])
      expect((await request(path, 'PATCH', body, 'staff')).status).toBe(403);
    for (const checkedIn of [true, false]) {
      const response = await request(path, 'PATCH', { checkedIn }, 'staff');
      expect(response.status).toBe(200);
      const row = await response.json();
      expect(Boolean(row.checkedInAt)).toBe(checkedIn);
      expect(row.status).toBe('confirmed');
    }
    expect((await request(path, 'PATCH', { checkedIn: 'true' }, 'staff')).status).toBe(400);
    expect((await request(path, 'DELETE', undefined, 'staff')).status).toBe(403);
    expect((await request(path, 'PATCH', { notes: 'Manager note' }, 'manager')).status).toBe(200);
    for (const role of ['owner', 'manager', 'staff']) {
      const csv = await request(`/bookings.csv?venueId=${venue.id}`, 'GET', undefined, role);
      expect(csv.status).toBe(200);
      expect(await csv.text()).toContain('private@example.test');
    }
    const availability = await request(
      `/venues/${venue.id}/availability?start=2188-01-01T12:00:00Z&end=2188-01-01T14:00:00Z`,
      'GET',
      undefined,
      'guest',
    );
    expect(availability.status).toBe(200);
    expect(await availability.text()).not.toContain('private@example.test');
    expect((await request(path, 'PATCH', { status: 'cancelled' }, 'manager')).status).toBe(200);
    expect((await request(path, 'DELETE')).status).toBe(200);
    expect((await request(path, 'PATCH', { status: 'no_show' })).status).toBe(409);
    expect(
      (
        await pool.query('SELECT user_id,action,entity FROM audit_log WHERE entity_id=$1', [
          booking.id,
        ])
      ).rows,
    ).toEqual([{ user_id: users.manager.id, action: 'booking.cancelled', entity: 'booking' }]);
  });
  it('rolls back booking and event pricing changes when their audit insert fails', async () => {
    const venue = await (
      await request('/venues', 'POST', { kind: 'cinema', name: 'Atomic audit' })
    ).json();
    const show = await (
      await request(`/venues/${venue.id}/shows`, 'POST', {
        title: 'Atomic show',
        start: '2188-02-01T12:00:00Z',
        end: '2188-02-01T14:00:00Z',
      })
    ).json();
    const booking = await (
      await request(
        '/bookings',
        'POST',
        {
          venueId: venue.id,
          showId: show.id,
          resourceId: venue.layout.floors[0].resources[0].id,
          guestName: 'Atomic guest',
        },
        'guest',
      )
    ).json();
    const pricingPath = `/venues/${venue.id}/shows/${show.id}/pricing`;
    const pricing = { multiplier: 1.5, overrides: [] };
    expect((await request(pricingPath, 'PUT', pricing, 'manager')).status).toBe(200);
    expect(
      (
        await pool.query('SELECT user_id,action,entity FROM audit_log WHERE entity_id=$1', [
          show.id,
        ])
      ).rows,
    ).toEqual([{ user_id: users.manager.id, action: 'pricing.changed', entity: 'show' }]);
    // Force a database audit failure to verify both writes share the mutation transaction.
    await pool.query(
      `ALTER TABLE audit_log ADD CONSTRAINT test_reject_audit CHECK (entity_id NOT IN ('${booking.id}', '${show.id}')) NOT VALID`,
    );
    try {
      expect(
        (await request(pricingPath, 'PUT', { multiplier: 2, overrides: [] }, 'manager')).status,
      ).toBe(500);
      expect(await (await request(pricingPath)).json()).toEqual(pricing);
      expect(
        (await request(`/bookings/${booking.id}`, 'DELETE', undefined, 'manager')).status,
      ).toBe(500);
      expect(
        (await pool.query('SELECT status FROM bookings WHERE id=$1', [booking.id])).rows[0].status,
      ).toBe('confirmed');
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM audit_log WHERE entity_id=ANY($1::uuid[])',
            [[booking.id, show.id]],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await pool.query('ALTER TABLE audit_log DROP CONSTRAINT test_reject_audit');
    }
  });
  it('applies changed roles and disabled accounts to existing sessions immediately', async () => {
    expect((await request(`/users/${users.staff.id}`, 'PATCH', { role: 'manager' })).status).toBe(
      200,
    );
    expect((await request('/venues?includeArchived=1', 'GET', undefined, 'staff')).status).toBe(
      200,
    );
    expect((await request(`/users/${users.staff.id}`, 'PATCH', { disabled: true })).status).toBe(
      200,
    );
    expect((await request('/bookings', 'GET', undefined, 'staff')).status).toBe(401);
    expect(
      (await request('/auth/login', 'POST', { email: users.staff.email, password }, 'guest'))
        .status,
    ).toBe(401);
  });
  it('protects the last active owner even when owners disable themselves concurrently', async () => {
    expect((await request(`/users/${users.owner.id}`, 'PATCH', { role: 'manager' })).status).toBe(
      409,
    );
    expect((await request(`/users/${users.owner.id}`, 'PATCH', { disabled: true })).status).toBe(
      409,
    );
    const created = await request('/users', 'POST', {
      email: `second-${randomUUID()}@example.test`,
      name: 'Second owner',
      password,
      role: 'owner',
    });
    expect(created.status).toBe(201);
    users.second = await created.json();
    const login = await request(
      '/auth/login',
      'POST',
      { email: users.second.email, password },
      'guest',
    );
    expect(login.status).toBe(200);
    cookies.second = login.headers.get('set-cookie')!.split(';')[0];
    const responses = await Promise.all([
      request(`/users/${users.owner.id}`, 'PATCH', { disabled: true }),
      request(`/users/${users.second.id}`, 'PATCH', { disabled: true }, 'second'),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});
