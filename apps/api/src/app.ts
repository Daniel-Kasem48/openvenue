import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { z } from 'zod';
import {
  layoutSchema,
  seatLocation,
  reservationPrice,
  bookingSchema,
  cloneLayout,
  createVenueSchema,
  intervalSchema,
  makeTemplate,
  saveVenueSchema,
} from '@openvenue/contracts';
import { initialize, syncResources, transaction } from './database';
import { authentication, tokenHash } from './auth';
import { generateScene, SceneGenerationError } from './scene-generation';

class RootModule {}
Module({})(RootModule);
const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
const bookingColumns = `b.id, b.venue_id AS "venueId", b.resource_id AS "resourceId", b.guest_name AS "guestName", b.starts_at AS start, b.ends_at AS end, b.status, b.party_size AS "partySize", b.price, b.currency, b.seat_location AS "seatLocation"`;
export async function createApp(config: {
  databaseUrl: string;
  adminPassword: string;
  secureCookies: boolean;
  publicOrigin?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
}) {
  if (config.adminPassword.length < 16)
    throw new Error('ADMIN_PASSWORD must contain at least 16 characters');
  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    await initialize(pool);
  } catch (error) {
    await pool.end();
    throw error;
  }
  const app = await NestFactory.create(RootModule, { logger: false, bodyParser: false });
  const close = app.close.bind(app);
  app.close = async () => {
    await close();
    await pool.end();
  };
  const router = express.Router(),
    { matches, guard } = authentication(pool, config.adminPassword);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'"],
          'worker-src': ["'self'", 'blob:'],
          'img-src': ["'self'", 'data:', 'blob:'],
          'upgrade-insecure-requests': config.secureCookies ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    '/api',
    rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  router.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin && origin !== (config.publicOrigin ?? `${req.protocol}://${req.get('host')}`)) {
        res.status(403).json({ message: 'Cross-origin requests are not allowed' });
        return;
      }
    }
    next();
  });
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.secureCookies,
    path: '/api',
    maxAge: 8 * 3600000,
  };
  router.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  });
  router.post(
    '/auth/login',
    rateLimit({ windowMs: 15 * 60000, limit: 10, legacyHeaders: false }),
    async (req, res) => {
      const { password } = z.object({ password: z.string().min(1).max(256) }).parse(req.body);
      if (!matches(password)) fail(401, 'Invalid password');
      const token = randomBytes(32).toString('hex');
      await pool.query('DELETE FROM sessions WHERE expires_at<=now()');
      await pool.query("INSERT INTO sessions VALUES($1,now()+interval '8 hours')", [
        tokenHash(token),
      ]);
      res.cookie('ov_session', token, cookieOptions).json({ authenticated: true });
    },
  );
  router.post(
    '/venues/:id/generate-scene',
    guard,
    rateLimit({
      windowMs: 15 * 60000,
      limit: 5,
      legacyHeaders: false,
      message: { message: 'Too many scene generations. Please wait before trying again.' },
    }),
    async (req, res) => {
      const { prompt } = z.object({ prompt: z.string().trim().min(10).max(4000) }).parse(req.body);
      const id = z.uuid().parse(req.params.id);
      const venue = await pool.query('SELECT kind FROM venues WHERE id=$1', [id]);
      if (!venue.rowCount) fail(404, 'Venue not found');
      res.json(
        await generateScene(prompt, venue.rows[0].kind, {
          apiKey: config.anthropicApiKey,
          model: config.anthropicModel,
        }),
      );
    },
  );
  router.get('/auth/me', guard, (_req, res) => {
    res.json({ authenticated: true });
  });
  router.post('/auth/logout', async (req, res) => {
    if (typeof req.cookies?.ov_session === 'string')
      await pool.query('DELETE FROM sessions WHERE token_hash=$1', [
        tokenHash(req.cookies.ov_session),
      ]);
    res.clearCookie('ov_session', cookieOptions).json({ authenticated: false });
  });
  router.param('id', (req, _res, next, id) => {
    z.uuid().parse(id);
    next();
  });
  router.get('/venues', async (_req, res) => {
    res.json(
      (
        await pool.query(`
      SELECT v.*, e.next_event_at AS "nextEventAt"
      FROM venues v LEFT JOIN (
        SELECT venue_id, min(starts_at) AS next_event_at FROM shows
        WHERE starts_at > now() GROUP BY venue_id
      ) e ON e.venue_id=v.id AND v.kind IN ('cinema', 'stadium')
      ORDER BY v.name
    `)
      ).rows,
    );
  });
  router.post('/venues', guard, async (req, res) => {
    const body = createVenueSchema.parse(req.body);
    const venue = await transaction(pool, async (client) => {
      let layout = makeTemplate(body.kind);
      if (body.empty && body.sourceId) fail(400, 'Choose an empty layout or duplicate a venue');
      if (body.empty)
        layout = {
          ...layout,
          pricing: { mode: 'free', currency: 'USD', amount: 0 },
          floors: [{ ...layout.floors[0], name: 'Main floor', resources: [], objects: [] }],
        };
      if (body.sourceId) {
        const source = (await client.query('SELECT * FROM venues WHERE id=$1', [body.sourceId]))
          .rows[0];
        if (!source) fail(404, 'Source venue not found');
        if (source.kind !== body.kind) fail(400, 'Duplicate must use the same venue type');
        layout = cloneLayout(layoutSchema.parse(source.layout));
      }
      const row = (
        await client.query(
          'INSERT INTO venues(id,name,kind,layout) VALUES($1,$2,$3,$4) RETURNING *',
          [randomUUID(), body.name, body.kind, JSON.stringify(layout)],
        )
      ).rows[0];
      await syncResources(client, row.id, layout);
      return row;
    });
    res.status(201).json(venue);
  });
  router.put('/venues/:id', guard, async (req, res) => {
    const body = saveVenueSchema.parse(req.body);
    const venue = await transaction(pool, async (client) => {
      const old = (
        await client.query('SELECT * FROM venues WHERE id=$1 FOR UPDATE', [req.params.id])
      ).rows[0];
      if (!old) fail(404, 'Venue not found');
      if (old.revision !== body.revision)
        fail(409, 'This layout changed elsewhere. Reload before editing.');
      const resourceKind = {
        restaurant: 'table',
        parking: 'space',
        cinema: 'seat',
        stadium: 'seat',
      }[old.kind as 'restaurant' | 'parking' | 'cinema' | 'stadium'];
      if (body.layout.floors.some((f) => f.resources.some((r) => r.kind !== resourceKind)))
        fail(400, 'Resource type does not match this venue');
      await syncResources(client, old.id, body.layout);
      return (
        await client.query(
          'UPDATE venues SET name=$2,layout=$3,revision=revision+1 WHERE id=$1 RETURNING *',
          [old.id, body.name, JSON.stringify(body.layout)],
        )
      ).rows[0];
    });
    res.json(venue);
  });
  router.get('/venues/:id/shows', async (req, res) => {
    res.json(
      (
        await pool.query(
          'SELECT id,title,starts_at AS start,ends_at AS end FROM shows WHERE venue_id=$1 AND ends_at>now() ORDER BY starts_at',
          [req.params.id],
        )
      ).rows,
    );
  });
  router.post('/venues/:id/shows', guard, async (req, res) => {
    const { title } = z.object({ title: z.string().trim().min(1).max(100) }).parse(req.body),
      times = intervalSchema.parse(req.body);
    if (Date.parse(times.start) <= Date.now()) fail(400, 'Show must start in the future');
    const venue = (await pool.query('SELECT kind FROM venues WHERE id=$1', [req.params.id]))
      .rows[0];
    if (!venue) fail(404, 'Venue not found');
    if (!['cinema', 'stadium'].includes(venue.kind))
      fail(400, 'Events are only available for cinemas and stadiums');
    const row = (
      await pool.query(
        'INSERT INTO shows VALUES($1,$2,$3,$4,$5) RETURNING id,title,starts_at AS start,ends_at AS end',
        [randomUUID(), req.params.id, title, times.start, times.end],
      )
    ).rows[0];
    res.status(201).json(row);
  });
  const blockSeatsSchema = z.object({
    resourceIds: z
      .array(z.uuid().transform((id) => id.toLowerCase()))
      .min(1)
      .max(1000)
      .refine((ids) => new Set(ids).size === ids.length, 'Choose each seat only once'),
    reason: z.string().trim().min(1).max(240),
  });
  router.get('/venues/:id/shows/:showId/blocks', guard, async (req, res) => {
    const venueId = z.uuid().parse(req.params.id),
      showId = z.uuid().parse(req.params.showId);
    res.json(
      (
        await pool.query(
          `SELECT b.resource_id AS "resourceId",b.reason FROM event_seat_blocks b JOIN shows s ON s.id=b.show_id WHERE s.venue_id=$1 AND s.id=$2`,
          [venueId, showId],
        )
      ).rows,
    );
  });
  router.post('/venues/:id/shows/:showId/blocks', guard, async (req, res) => {
    const venueId = z.uuid().parse(req.params.id),
      showId = z.uuid().parse(req.params.showId);
    const body = blockSeatsSchema.parse(req.body);
    await transaction(pool, async (client) => {
      const venue = (
        await client.query('SELECT layout FROM venues WHERE id=$1 FOR UPDATE', [venueId])
      ).rows[0];
      if (!venue) fail(404, 'Venue not found');
      const show = (
        await client.query('SELECT * FROM shows WHERE id=$1 AND venue_id=$2', [showId, venueId])
      ).rows[0];
      if (!show) fail(404, 'Event not found');
      if (new Date(show.ends_at).getTime() <= Date.now()) fail(400, 'This event has ended');
      const seats = layoutSchema
        .parse(venue.layout)
        .floors.flatMap((f) => f.resources)
        .filter((r) => r.kind === 'seat');
      if (body.resourceIds.some((id) => !seats.some((r) => r.id === id)))
        fail(400, 'Choose seats from this venue');
      const booked = await client.query(
        "SELECT id FROM bookings WHERE resource_id=ANY($1::uuid[]) AND status='confirmed' AND starts_at<$3 AND ends_at>$2",
        [body.resourceIds, show.starts_at, show.ends_at],
      );
      if (booked.rowCount)
        fail(409, 'Some selected seats are already booked. No seats were blocked.');
      await client.query(
        `INSERT INTO event_seat_blocks(show_id,resource_id,reason) SELECT $1,unnest($2::uuid[]),$3 ON CONFLICT(show_id,resource_id) DO UPDATE SET reason=EXCLUDED.reason`,
        [showId, body.resourceIds, body.reason],
      );
    });
    res.status(201).json({ blocked: body.resourceIds });
  });
  router.delete('/venues/:id/shows/:showId/blocks', guard, async (req, res) => {
    const venueId = z.uuid().parse(req.params.id),
      showId = z.uuid().parse(req.params.showId);
    const { resourceIds } = blockSeatsSchema.omit({ reason: true }).parse(req.body);
    await transaction(pool, async (client) => {
      await client.query('SELECT id FROM venues WHERE id=$1 FOR UPDATE', [venueId]);
      const show = await client.query('SELECT id FROM shows WHERE id=$1 AND venue_id=$2', [
        showId,
        venueId,
      ]);
      if (!show.rowCount) fail(404, 'Event not found');
      await client.query(
        'DELETE FROM event_seat_blocks WHERE show_id=$1 AND resource_id=ANY($2::uuid[])',
        [showId, resourceIds],
      );
    });
    res.json({ released: resourceIds });
  });
  router.get('/venues/:id/availability', async (req, res) => {
    const times = intervalSchema.parse(req.query);
    const rows = await pool.query(
      "SELECT resource_id FROM bookings WHERE venue_id=$1 AND status='confirmed' AND starts_at<$3 AND ends_at>$2",
      [req.params.id, times.start, times.end],
    );
    const showId = z.uuid().optional().parse(req.query.showId);
    const blocked = await pool.query(
      `SELECT b.resource_id FROM event_seat_blocks b JOIN shows s ON s.id=b.show_id WHERE s.venue_id=$1 AND ($4::uuid IS NULL OR s.id=$4) AND s.starts_at<$3 AND s.ends_at>$2`,
      [req.params.id, times.start, times.end, showId ?? null],
    );
    const blockedIds = blocked.rows.map((r) => r.resource_id);
    res.json({
      busy: [...new Set([...rows.rows.map((r) => r.resource_id), ...blockedIds])],
      blocked: blockedIds,
    });
  });
  router.post(
    '/bookings',
    rateLimit({ windowMs: 60000, limit: 30, legacyHeaders: false }),
    async (req, res) => {
      const body = bookingSchema.parse(req.body);
      const booked = await transaction(pool, async (client) => {
        const venue = (
          await client.query('SELECT kind,layout FROM venues WHERE id=$1 FOR UPDATE', [
            body.venueId,
          ])
        ).rows[0];
        if (!venue) fail(404, 'Venue not found');
        let times;
        if (['cinema', 'stadium'].includes(venue.kind)) {
          if (!body.showId) fail(400, 'Choose a showtime');
          const show = (
            await client.query('SELECT starts_at,ends_at FROM shows WHERE id=$1 AND venue_id=$2', [
              body.showId,
              body.venueId,
            ])
          ).rows[0];
          if (!show) fail(400, 'Showtime not found');
          times = { start: show.starts_at.toISOString(), end: show.ends_at.toISOString() };
        } else {
          if (body.showId) fail(400, 'Events are only available for cinemas and stadiums');
          times = intervalSchema.parse(body);
        }
        if (Date.parse(times.start) <= Date.now())
          fail(400, 'Reservations must start in the future');
        const ids = body.resourceIds ?? [body.resourceId];
        if (ids[0] !== body.resourceId)
          fail(400, 'The first selected seat must match the resource');
        if (!['cinema', 'stadium'].includes(venue.kind) && ids.length !== 1)
          fail(400, 'Choose one table or parking space');
        if (['cinema', 'stadium'].includes(venue.kind) && ids.length !== body.partySize)
          fail(400, 'Choose one seat for each guest');
        if (venue.kind === 'parking' && body.partySize !== 1)
          fail(400, 'Reserve one parking space at a time');
        const layout = layoutSchema.parse(venue.layout);
        const resources = layout.floors.flatMap((f) => f.resources);
        for (const id of ids) {
          const resource = resources.find((r) => r.id === id);
          if (!resource) return fail(404, 'Resource not found');
          if (venue.kind === 'restaurant' && resource.capacity < body.partySize)
            fail(400, 'Your party exceeds this table’s capacity');
        }
        if (
          body.showId &&
          (
            await client.query(
              'SELECT resource_id FROM event_seat_blocks WHERE show_id=$1 AND resource_id=ANY($2::uuid[])',
              [body.showId, ids],
            )
          ).rowCount
        )
          fail(409, 'Some selected seats are blocked for this event. Choose other seats.');
        const total = ids.reduce(
          (sum, id) =>
            sum +
            reservationPrice(
              layout,
              resources.find((r) => r.id === id)!,
            ),
          0,
        );
        if (
          (total > 0 || body.expectedTotal !== undefined) &&
          (body.expectedTotal !== total || body.expectedCurrency !== layout.pricing.currency)
        )
          fail(409, 'Prices changed. Review the updated total before confirming.');
        const bookings = [];
        for (const id of ids) {
          bookings.push(
            (
              await client.query(
                `INSERT INTO bookings AS b(id,venue_id,resource_id,guest_name,starts_at,ends_at,show_id,party_size,price,currency,seat_location) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${bookingColumns}`,
                [
                  randomUUID(),
                  body.venueId,
                  id,
                  body.guestName,
                  times.start,
                  times.end,
                  body.showId ?? null,
                  venue.kind === 'restaurant' ? body.partySize : 1,
                  reservationPrice(
                    layout,
                    resources.find((r) => r.id === id)!,
                  ),
                  layout.pricing.currency,
                  seatLocation(resources.find((r) => r.id === id)!),
                ],
              )
            ).rows[0],
          );
        }
        return body.resourceIds ? { ...bookings[0], bookings } : bookings[0];
      });
      res.status(201).json(booked);
    },
  );
  router.get('/bookings', guard, async (_req, res) => {
    res.json(
      (
        await pool.query(
          `SELECT ${bookingColumns}, v.name AS "venueName",r.label AS "resourceLabel" FROM bookings b JOIN venues v ON v.id=b.venue_id JOIN resources r ON r.id=b.resource_id WHERE b.status='confirmed' ORDER BY b.starts_at LIMIT 500`,
        )
      ).rows,
    );
  });
  router.delete('/bookings/:id', guard, async (req, res) => {
    const result = await pool.query(
      "UPDATE bookings SET status='cancelled' WHERE id=$1 RETURNING id",
      [req.params.id],
    );
    if (!result.rowCount) fail(404, 'Reservation not found');
    res.json({ cancelled: true });
  });
  app.use('/api', router);
  app.use('/api', (_req: express.Request, res: express.Response) =>
    res.status(404).json({ message: 'Endpoint not found' }),
  );
  app.use(express.static(resolve('dist/web')));
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method === 'GET' && req.accepts('html')) res.sendFile(resolve('dist/web/index.html'));
    else next();
  });
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.issues.map((i) => i.message).join('; ') });
      return;
    }
    const status =
      error.code === '23P01' ? 409 : error.code === '23503' ? 409 : (error.status ?? 500);
    const message =
      error.code === '23P01'
        ? 'That resource was just reserved. Choose another time or place.'
        : error.code === '23503'
          ? 'Cannot remove a resource with reservation history or event blocks.'
          : error instanceof SceneGenerationError
            ? error.message
            : status >= 500
              ? 'Something went wrong. Please try again.'
              : error.message;
    if (status >= 500) console.error('API failure', error.code ?? error.name);
    res.status(status).json({ message });
  };
  app.use(errors);
  await app.init();
  return app;
}
