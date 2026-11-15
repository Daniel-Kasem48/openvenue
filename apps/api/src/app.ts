import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';
import {
  overviewRangeSchema,
  layoutSchema,
  seatLocation,
  reservationPrice,
  eventPricingSchema,
  type EventPricing,
  bookingSchema,
  eventSchema,
  bookingFiltersSchema,
  bookingPatchSchema,
  cloneLayout,
  createVenueSchema,
  intervalSchema,
  makeTemplate,
  saveVenueSchema,
  patchVenueSchema,
} from '@openvenue/contracts';
import { adminBookingSelect, bookingColumns, bookingsCsv, queryBookings } from './reservations';
import { overview } from './overview';
import { initialize, syncResources, transaction } from './database';
import { authentication, tokenHash } from './auth';
import { generateScene, SceneGenerationError } from './scene-generation';

class RootModule {}
Module({})(RootModule);
const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};

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
  router.get(
    '/venues',
    (req, res, next) => {
      const query = z.object({ includeArchived: z.enum(['0', '1']).optional() }).parse(req.query);
      if (query.includeArchived === '1') return guard(req, res, next);
      next();
    },
    async (req, res) => {
      res.json(
        (
          await pool.query(
            `SELECT v.*, v.archived_at AS "archivedAt", e.next_event_at AS "nextEventAt"
             FROM venues v LEFT JOIN (
               SELECT venue_id, min(starts_at) AS next_event_at FROM shows
               WHERE starts_at > now() GROUP BY venue_id
             ) e ON e.venue_id=v.id AND v.kind IN ('cinema','stadium')
             WHERE ($1 OR v.archived_at IS NULL) ORDER BY v.name`,
            [req.query.includeArchived === '1'],
          )
        ).rows,
      );
    },
  );
  router.patch('/venues/:id', guard, async (req, res) => {
    const body = patchVenueSchema.parse(req.body);
    const venue = await transaction(pool, async (client) => {
      const old = (
        await client.query('SELECT * FROM venues WHERE id=$1 FOR UPDATE', [req.params.id])
      ).rows[0];
      if (!old) fail(404, 'Venue not found');
      if (old.revision !== body.revision)
        fail(409, 'This venue changed elsewhere. Reload before editing.');
      return (
        await client.query(
          `UPDATE venues SET name=$2, archived_at=$3, revision=revision+1 WHERE id=$1 RETURNING *, archived_at AS "archivedAt"`,
          [
            old.id,
            body.name ?? old.name,
            body.archived === undefined
              ? old.archived_at
              : body.archived
                ? (old.archived_at ?? new Date())
                : null,
          ],
        )
      ).rows[0];
    });
    res.json(venue);
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
      const eventPrices = await client.query(
        `SELECT s.price_multiplier,
          coalesce(json_agg(json_build_object('tierId', p.tier_id, 'amount', p.amount))
            FILTER (WHERE p.tier_id IS NOT NULL), '[]') AS overrides
        FROM shows s LEFT JOIN show_prices p ON p.show_id=s.id
        WHERE s.venue_id=$1 AND s.ends_at>now() GROUP BY s.id`,
        [old.id],
      );
      const resources = body.layout.floors.flatMap((floor) => floor.resources);
      for (const row of eventPrices.rows) {
        const pricing = eventPricingSchema.parse({
          multiplier: Number(row.price_multiplier),
          overrides: row.overrides,
        });
        for (const resource of resources) reservationPrice(body.layout, resource, pricing);
      }
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
  router.get('/venues/:id/events', guard, async (req, res) => {
    const venueId = z.uuid().parse(req.params.id);
    res.json(
      (
        await pool.query(
          `
      SELECT s.id,s.title,s.starts_at AS start,s.ends_at AS end,
        (SELECT count(*)::int FROM bookings b WHERE b.show_id=s.id AND b.status='confirmed') AS sold,
        (SELECT count(*)::int FROM event_seat_blocks b WHERE b.show_id=s.id) AS blocked,
        greatest(0,(SELECT count(*)::int FROM resources r WHERE r.venue_id=s.venue_id)
          -(SELECT count(*)::int FROM event_seat_blocks b WHERE b.show_id=s.id)) AS capacity
      FROM shows s WHERE s.venue_id=$1 ORDER BY (s.ends_at<=now()),s.starts_at,s.id`,
          [venueId],
        )
      ).rows,
    );
  });
  router.post('/venues/:id/shows', guard, async (req, res) => {
    const venueId = z.uuid().parse(req.params.id),
      body = eventSchema.parse(req.body);
    const row = await transaction(pool, async (client) => {
      const venue = (
        await client.query('SELECT kind FROM venues WHERE id=$1 FOR UPDATE', [venueId])
      ).rows[0];
      if (!venue) fail(404, 'Venue not found');
      if (!['cinema', 'stadium'].includes(venue.kind))
        fail(400, 'Events are only available for cinemas and stadiums');
      if (Date.parse(body.start) <= Date.now()) fail(400, 'Show must start in the future');
      return (
        await client.query(
          'INSERT INTO shows(id,venue_id,title,starts_at,ends_at) VALUES($1,$2,$3,$4,$5) RETURNING id,title,starts_at AS start,ends_at AS end',
          [randomUUID(), venueId, body.title, body.start, body.end],
        )
      ).rows[0];
    });
    res.status(201).json(row);
  });
  async function lockShow(client: PoolClient, venueId: string, showId: string) {
    await client.query('SELECT id FROM venues WHERE id=$1 FOR UPDATE', [venueId]);
    const show = (
      await client.query('SELECT * FROM shows WHERE id=$1 AND venue_id=$2', [showId, venueId])
    ).rows[0];
    if (!show) fail(404, 'Event not found');
    return show;
  }
  async function readEventPricing(
    client: Pool | PoolClient,
    venueId: string,
    showId: string,
  ): Promise<EventPricing> {
    const row = (
      await client.query(
        `SELECT s.price_multiplier,
      coalesce(json_agg(json_build_object('tierId', p.tier_id, 'amount', p.amount) ORDER BY p.tier_id) FILTER (WHERE p.tier_id IS NOT NULL), '[]') AS overrides
      FROM shows s LEFT JOIN show_prices p ON p.show_id=s.id
      WHERE s.id=$1 AND s.venue_id=$2 GROUP BY s.id`,
        [showId, venueId],
      )
    ).rows[0];
    if (!row) fail(404, 'Event not found');
    return eventPricingSchema.parse({
      multiplier: Number(row.price_multiplier),
      overrides: row.overrides,
    });
  }
  router.get('/venues/:id/shows/:showId/pricing', guard, async (req, res) => {
    res.json(
      await readEventPricing(
        pool,
        z.uuid().parse(req.params.id),
        z.uuid().parse(req.params.showId),
      ),
    );
  });
  router.put('/venues/:id/shows/:showId/pricing', guard, async (req, res) => {
    const venueId = z.uuid().parse(req.params.id),
      showId = z.uuid().parse(req.params.showId);
    const pricing = eventPricingSchema.parse(req.body);
    await transaction(pool, async (client) => {
      await lockShow(client, venueId, showId);
      const venue = (await client.query('SELECT layout FROM venues WHERE id=$1', [venueId]))
        .rows[0];
      const layout = layoutSchema.parse(venue.layout);
      if (
        pricing.overrides.some(
          (override) => !layout.pricing.tiers?.some((tier) => tier.id === override.tierId),
        )
      )
        fail(400, 'Price tier not found in this venue');
      for (const resource of layout.floors.flatMap((floor) => floor.resources))
        reservationPrice(layout, resource, pricing);
      await client.query('UPDATE shows SET price_multiplier=$2 WHERE id=$1', [
        showId,
        pricing.multiplier,
      ]);
      await client.query('DELETE FROM show_prices WHERE show_id=$1', [showId]);
      for (const override of pricing.overrides)
        await client.query('INSERT INTO show_prices(show_id,tier_id,amount) VALUES($1,$2,$3)', [
          showId,
          override.tierId,
          override.amount,
        ]);
    });
    res.json(pricing);
  });
  router.put('/venues/:id/shows/:showId', guard, async (req, res) => {
    const venueId = z.uuid().parse(req.params.id),
      showId = z.uuid().parse(req.params.showId),
      body = eventSchema.parse(req.body);
    const row = await transaction(pool, async (client) => {
      const show = await lockShow(client, venueId, showId);
      const moved =
        Date.parse(body.start) !== +show.starts_at || Date.parse(body.end) !== +show.ends_at;
      if (moved && Date.parse(body.start) <= Date.now())
        fail(400, 'Rescheduled events must start in the future');
      if (moved)
        await client.query(
          "UPDATE bookings SET starts_at=$2,ends_at=$3 WHERE show_id=$1 AND status='confirmed'",
          [showId, body.start, body.end],
        );
      return (
        await client.query(
          'UPDATE shows SET title=$2,starts_at=$3,ends_at=$4 WHERE id=$1 RETURNING id,title,starts_at AS start,ends_at AS end',
          [showId, body.title, body.start, body.end],
        )
      ).rows[0];
    }).catch((error) => {
      if (error.code === '23P01')
        fail(
          409,
          'Cannot reschedule: a booked seat overlaps another reservation. No changes were saved.',
        );
      throw error;
    });
    res.json(row);
  });
  const removeShow =
    (cancel: boolean): express.RequestHandler =>
    async (req, res) => {
      const venueId = z.uuid().parse(req.params.id),
        showId = z.uuid().parse(req.params.showId);
      const affected = await transaction(pool, async (client) => {
        const show = await lockShow(client, venueId, showId);
        const count = (
          await client.query(
            "SELECT count(*)::int AS total FROM bookings WHERE show_id=$1 AND status='confirmed'",
            [showId],
          )
        ).rows[0].total;
        if (count && !cancel)
          fail(
            409,
            `This event has ${count} confirmed reservations. Use Cancel event to cancel them explicitly.`,
          );
        if (cancel)
          await client.query(
            "UPDATE bookings SET status='cancelled',checked_in_at=NULL WHERE show_id=$1 AND status='confirmed'",
            [showId],
          );
        // Keep reservation history and its title after removing the event foreign key.
        await client.query(
          'UPDATE bookings SET event_title=coalesce(event_title,$2),show_id=NULL WHERE show_id=$1',
          [showId, show.title],
        );
        await client.query('DELETE FROM event_seat_blocks WHERE show_id=$1', [showId]);
        await client.query('DELETE FROM show_prices WHERE show_id=$1', [showId]);
        await client.query('DELETE FROM shows WHERE id=$1', [showId]);
        return count;
      });
      res.json({ deleted: true, cancelledBookings: affected });
    };
  router.delete('/venues/:id/shows/:showId', guard, removeShow(false));
  router.post('/venues/:id/shows/:showId/cancel', guard, removeShow(true));
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
    const venue = (await pool.query('SELECT layout FROM venues WHERE id=$1', [req.params.id]))
      .rows[0];
    if (!venue) fail(404, 'Venue not found');
    const layout = layoutSchema.parse(venue.layout);
    const rows = await pool.query(
      "SELECT resource_id FROM bookings WHERE venue_id=$1 AND status='confirmed' AND starts_at<$3 AND ends_at>$2",
      [req.params.id, times.start, times.end],
    );
    const showId = z.uuid().optional().parse(req.query.showId);
    const pricing = showId ? await readEventPricing(pool, req.params.id, showId) : undefined;
    const prices = Object.fromEntries(
      layout.floors
        .flatMap((floor) => floor.resources)
        .map((resource) => [resource.id, reservationPrice(layout, resource, pricing)]),
    );
    const blocked = await pool.query(
      `SELECT b.resource_id FROM event_seat_blocks b JOIN shows s ON s.id=b.show_id WHERE s.venue_id=$1 AND ($4::uuid IS NULL OR s.id=$4) AND s.starts_at<$3 AND s.ends_at>$2`,
      [req.params.id, times.start, times.end, showId ?? null],
    );
    const blockedIds = blocked.rows.map((r) => r.resource_id);
    res.json({
      busy: [...new Set([...rows.rows.map((r) => r.resource_id), ...blockedIds])],
      blocked: blockedIds,
      prices,
      currency: layout.pricing.currency,
    });
  });
  router.post(
    '/bookings',
    rateLimit({ windowMs: 60000, limit: 30, legacyHeaders: false }),
    async (req, res) => {
      const body = bookingSchema.parse(req.body);
      const booked = await transaction(pool, async (client) => {
        const venue = (
          await client.query('SELECT kind,layout,archived_at FROM venues WHERE id=$1 FOR UPDATE', [
            body.venueId,
          ])
        ).rows[0];
        if (!venue) fail(404, 'Venue not found');
        if (venue.archived_at) fail(409, 'This venue is archived and cannot receive reservations.');
        let times;
        let eventTitle: string | null = null;
        if (['cinema', 'stadium'].includes(venue.kind)) {
          if (!body.showId) fail(400, 'Choose a showtime');
          const show = (
            await client.query(
              'SELECT title,starts_at,ends_at FROM shows WHERE id=$1 AND venue_id=$2',
              [body.showId, body.venueId],
            )
          ).rows[0];
          if (!show) fail(400, 'Showtime not found');
          eventTitle = show.title;
          times = { start: show.starts_at.toISOString(), end: show.ends_at.toISOString() };
          if (
            (body.start !== undefined || body.end !== undefined) &&
            (Date.parse(body.start ?? '') !== +show.starts_at ||
              Date.parse(body.end ?? '') !== +show.ends_at)
          )
            fail(409, 'Event time changed. Review the updated schedule before confirming.');
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
        const eventPricing = body.showId
          ? await readEventPricing(client, body.venueId, body.showId)
          : undefined;
        const prices = Object.fromEntries(
          ids.map((id) => [
            id,
            reservationPrice(
              layout,
              resources.find((resource) => resource.id === id)!,
              eventPricing,
            ),
          ]),
        );
        const total = ids.reduce((sum, id) => sum + prices[id], 0);
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
                `INSERT INTO bookings AS b(id,venue_id,resource_id,guest_name,starts_at,ends_at,show_id,party_size,price,currency,seat_location,event_title,guest_email,guest_phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING ${bookingColumns}`,
                [
                  randomUUID(),
                  body.venueId,
                  id,
                  body.guestName,
                  times.start,
                  times.end,
                  body.showId ?? null,
                  venue.kind === 'restaurant' ? body.partySize : 1,
                  prices[id],
                  layout.pricing.currency,
                  seatLocation(resources.find((r) => r.id === id)!),
                  eventTitle,
                  body.guestEmail ?? null,
                  body.guestPhone ?? null,
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
  router.get('/overview', guard, async (req, res) => {
    const { from, to } = overviewRangeSchema.parse(req.query);
    res.json(await overview(pool, from, to));
  });
  router.get('/bookings', guard, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await queryBookings(pool, bookingFiltersSchema.parse(req.query), true));
  });
  router.get('/bookings.csv', guard, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const rows = await queryBookings(pool, bookingFiltersSchema.parse(req.query), false);
    res.setHeader('Content-Disposition', 'attachment; filename="reservations.csv"');
    res.type('text/csv; charset=utf-8').send(bookingsCsv(rows.items));
  });
  async function patchBooking(id: string, body: z.infer<typeof bookingPatchSchema>) {
    return transaction(pool, async (client) => {
      const found = (await client.query('SELECT venue_id FROM bookings WHERE id=$1', [id])).rows[0];
      if (!found) fail(404, 'Reservation not found');
      await client.query('SELECT id FROM venues WHERE id=$1 FOR UPDATE', [found.venue_id]);
      const booking = (
        await client.query('SELECT status FROM bookings WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (body.checkedIn === true && booking.status !== 'confirmed')
        fail(409, 'Only confirmed reservations can be checked in');
      if (body.status && booking.status !== 'confirmed' && body.status !== booking.status)
        fail(409, 'This reservation already has a terminal status');
      await client.query(
        `UPDATE bookings SET notes=coalesce($2,notes),status=coalesce($3,status),
        checked_in_at=CASE WHEN coalesce($3,status)<>'confirmed' THEN NULL
          WHEN $4::boolean IS NULL THEN checked_in_at WHEN $4 THEN coalesce(checked_in_at,now()) ELSE NULL END
        WHERE id=$1`,
        [id, body.notes ?? null, body.status ?? null, body.checkedIn ?? null],
      );
      return (await client.query(adminBookingSelect + ' WHERE b.id=$1', [id])).rows[0];
    });
  }
  router.patch('/bookings/:id', guard, async (req, res) => {
    res.json(await patchBooking(z.uuid().parse(req.params.id), bookingPatchSchema.parse(req.body)));
  });
  router.delete('/bookings/:id', guard, async (req, res) => {
    await patchBooking(z.uuid().parse(req.params.id), { status: 'cancelled' });
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
