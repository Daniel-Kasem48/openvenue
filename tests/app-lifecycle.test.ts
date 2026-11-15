import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/postgresql';
import { randomUUID } from 'node:crypto';
import { makeTemplate } from '@openvenue/contracts';
import { Venue } from '../apps/api/src/database/entities';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../apps/api/src/app';
import { DatabaseService } from '../apps/api/src/database/database.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const config = {
  databaseUrl: databaseUrl ?? 'postgres://unused',
  adminPassword: 'integration-password-123',
  secureCookies: false,
};
afterEach(() => vi.restoreAllMocks());

it('closes the ORM when application initialization fails', async () => {
  const failure = new Error('Migration failed');
  const close = vi.fn();
  vi.spyOn(MikroORM, 'init').mockResolvedValueOnce({
    em: { fork: () => ({ transactional: () => Promise.reject(failure) }) },
    close,
  } as unknown as MikroORM);
  await expect(createApp(config)).rejects.toBe(failure);
  expect(close).toHaveBeenCalledOnce();
});

describe.skipIf(!databaseUrl)('Nest application lifecycle and routing', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });
  it('isolates entity state between operations and rolls back flushed writes', async () => {
    app = await createApp(config);
    const db = app.get(DatabaseService);
    const first = db.em,
      second = db.em;
    expect(first).not.toBe(second);
    const [venue] = await first.find(Venue, {}, { limit: 1 });
    expect(venue).toBeDefined();
    const originalName = venue.name;
    venue.name = 'Unflushed private change';
    expect((await second.findOneOrFail(Venue, venue.id)).name).toBe(originalName);
    const id = randomUUID();
    await expect(
      db.em.transactional(async (em) => {
        em.create(Venue, {
          id,
          name: 'Rolled back ORM venue',
          kind: 'parking',
          layout: makeTemplate('parking'),
        });
        await em.flush();
        throw new Error('Abort after flush');
      }),
    ).rejects.toThrow('Abort after flush');
    expect(await db.em.count(Venue, { id })).toBe(0);
  });
  it('checks permissions before consuming the scene-generation allowance', async () => {
    app = await createApp(config);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const venue = (await (await fetch(base + '/api/venues')).json())[0];
    const url = base + `/api/venues/${venue.id}/generate-scene`;
    const body = JSON.stringify({ prompt: 'Create a venue with twelve seats' });
    for (let i = 0; i < 6; i++) {
      const rejected = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      expect(rejected.status).toBe(401);
    }
    const login = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: config.adminPassword }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const invalidCsv = await fetch(base + '/api/bookings.csv?limit=not-a-number', {
      headers: { cookie },
    });
    expect(invalidCsv.status).toBe(400);
    expect(invalidCsv.headers.get('content-disposition')).toBeNull();
    expect(invalidCsv.headers.get('content-type')).toContain('application/json');
    const allowed = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body,
    });
    // No provider key is configured in tests; authorized requests reach the service.
    expect(allowed.status).toBe(503);
  });
  it('keeps API errors out of the SPA fallback and closes the pool on shutdown', async () => {
    app = await createApp(config);
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const unknown = await fetch(base + '/api/does-not-exist', { headers: { Accept: 'text/html' } });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ message: 'Endpoint not found' });
    const malformed = await fetch(base + '/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"broken":',
    });
    expect(malformed.status).toBe(400);
    expect(typeof (await malformed.json()).message).toBe('string');
    const invalidId = await fetch(base + '/api/venues/not-a-uuid/availability');
    expect(invalidId.status).toBe(400);
    expect(await (await fetch(base + '/api/health')).json()).toEqual({ status: 'ok' });
    expect(await (await fetch(base + '/API/health')).json()).toEqual({ status: 'ok' });
    const db = app.get(DatabaseService);
    const ormClose = vi.spyOn(MikroORM.prototype, 'close');
    await app.close();
    app = undefined;
    expect(ormClose).toHaveBeenCalledOnce();
    expect(() => db.em).toThrow('Database is not initialized');
  });
});
