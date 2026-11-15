import { Inject, Injectable } from '@nestjs/common';
import {
  cloneLayout,
  createVenueSchema,
  eventPricingSchema,
  layoutSchema,
  makeTemplate,
  patchVenueSchema,
  reservationPrice,
  saveVenueSchema,
} from '@openvenue/contracts';
import { LockMode } from '@mikro-orm/core';
import { Venue } from '../database/entities';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../auth/credentials';
import { audit } from '../../common/audit';
import { fail } from '../../common/errors';
import { DatabaseService } from '../database/database.service';
import { syncResources } from '../database/queries';

@Injectable()
export class VenuesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async list(query: Record<string, unknown>) {
    return this.db.em.getRepository(Venue).listWithNextEvent(query.includeArchived === '1');
  }

  async create(input: unknown) {
    const body = createVenueSchema.parse(input);
    const venue = await this.db.em.transactional(async (em) => {
      const venues = em.getRepository(Venue);
      let layout = makeTemplate(body.kind);
      if (body.empty && body.sourceId) fail(400, 'Choose an empty layout or duplicate a venue');
      if (body.empty)
        layout = {
          ...layout,
          pricing: { mode: 'free', currency: 'USD', amount: 0 },
          floors: [{ ...layout.floors[0], name: 'Main floor', resources: [], objects: [] }],
        };
      if (body.sourceId) {
        const source = await venues.findOne(body.sourceId);
        if (!source) return fail(404, 'Source venue not found');
        if (source.kind !== body.kind) fail(400, 'Duplicate must use the same venue type');
        layout = cloneLayout(layoutSchema.parse(source.layout));
      }
      const row = venues.create({
        id: randomUUID(),
        name: body.name,
        kind: body.kind,
        layout,
        archived_at: null,
      });
      await em.flush();
      await syncResources(em, row.id, layout);
      return row;
    });
    return venue;
  }
  async update(id: string, input: unknown) {
    const body = patchVenueSchema.parse(input);
    const venue = await this.db.em.transactional(async (em) => {
      const old = await em
        .getRepository(Venue)
        .findOne(id, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!old) return fail(404, 'Venue not found');
      if (old.revision !== body.revision)
        fail(409, 'This venue changed elsewhere. Reload before editing.');
      em.assign(old, {
        name: body.name ?? old.name,
        archived_at:
          body.archived === undefined
            ? old.archived_at
            : body.archived
              ? (old.archived_at ?? new Date())
              : null,
        revision: old.revision + 1,
      });
      await em.flush();
      return { ...old, archivedAt: old.archived_at };
    });
    return venue;
  }
  async saveLayout(id: string, input: unknown, principal: Principal) {
    const body = saveVenueSchema.parse(input);
    const venue = await this.db.em.transactional(async (em) => {
      const venues = em.getRepository(Venue);
      const old = await venues.findOne(id, { lockMode: LockMode.PESSIMISTIC_WRITE });
      if (!old) return fail(404, 'Venue not found');
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
      const eventPrices = await venues.readActivePricing(old.id);
      const resources = body.layout.floors.flatMap((floor) => floor.resources);
      for (const row of eventPrices) {
        const pricing = eventPricingSchema.parse({
          multiplier: Number(row.price_multiplier),
          overrides: row.overrides,
        });
        for (const resource of resources) reservationPrice(body.layout, resource, pricing);
      }
      await syncResources(em, old.id, body.layout);
      await audit(em, principal, 'layout.saved', 'venue', old.id);
      const priceFields = (layout: ReturnType<typeof layoutSchema.parse>) =>
        JSON.stringify({
          pricing: layout.pricing,
          resources: layout.floors.flatMap((f) =>
            f.resources.map((r) => ({
              id: r.id,
              price: r.price,
              tierId: r.tierId,
            })),
          ),
        });
      if (priceFields(layoutSchema.parse(old.layout)) !== priceFields(body.layout))
        await audit(em, principal, 'pricing.changed', 'venue', old.id);
      em.assign(old, { name: body.name, layout: body.layout, revision: old.revision + 1 });
      await em.flush();
      return old;
    });
    return venue;
  }
}
