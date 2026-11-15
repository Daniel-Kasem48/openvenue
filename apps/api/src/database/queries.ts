import { makeTemplate, type Layout, type VenueKind } from '@openvenue/contracts';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { EntityManager } from '@mikro-orm/postgresql';
import { Resource, Show, Venue } from './entities';

export async function syncResources(em: EntityManager, venueId: string, layout: Layout) {
  const resources = layout.floors.flatMap((f) => f.resources);
  const ids = resources.map((r) => r.id);
  if (await em.count(Resource, { id: { $in: ids }, venue_id: { $ne: venueId } }))
    throw Object.assign(new Error('Resource identifiers belong to another venue'), { status: 409 });
  await em.execute(
    `DELETE FROM event_seat_blocks b USING shows s, resources r
     WHERE b.show_id=s.id AND b.resource_id=r.id AND r.venue_id=?
       AND NOT (r.id=ANY(ARRAY[?]::uuid[])) AND s.ends_at<=now()`,
    [venueId, ids],
  );
  await em.nativeDelete(Resource, { venue_id: venueId, id: { $nin: ids } });
  for (const resource of resources) {
    // The ownership predicate also protects concurrent inserts from another venue.
    const rows = await em.execute(
      `INSERT INTO resources(id,venue_id,label) VALUES(?,?,?) ON CONFLICT(id)
       DO UPDATE SET label=EXCLUDED.label WHERE resources.venue_id=EXCLUDED.venue_id RETURNING id`,
      [resource.id, venueId, resource.label],
    );
    if (!rows.length)
      throw Object.assign(new Error('Resource identifiers belong to another venue'), {
        status: 409,
      });
  }
}

export async function initialize(em: EntityManager) {
  // Existing idempotent SQL migrations preserve PostgreSQL-specific constraints on upgrades.
  const migrations = [
    '001_initial',
    '002_party_size',
    '003_stadium_pricing',
    '004_event_seat_blocks',
    '005_event_management',
    '006_venue_archive',
    '007_booking_details',
    '008_show_pricing',
    '009_staff_accounts',
  ];
  const scripts = await Promise.all(
    migrations.map((name) =>
      readFile(new URL(`../../migrations/${name}.sql`, import.meta.url), 'utf8'),
    ),
  );
  await em.transactional(async (em) => {
    await em.execute('SELECT pg_advisory_xact_lock(745921)');
    for (const script of scripts) await em.execute(script);
    if (await em.count(Venue, {})) return;
    for (const [kind, name] of [
      ['restaurant', 'The Greenhouse'],
      ['parking', 'Central Parking'],
      ['cinema', 'Studio Cinema'],
      ['stadium', 'Riverside Stadium'],
    ] as [VenueKind, string][]) {
      const id = randomUUID(),
        layout = makeTemplate(kind);
      em.create(Venue, { id, name, kind, layout });
      await em.flush();
      await syncResources(em, id, layout);
      if (kind === 'cinema' || kind === 'stadium') {
        const start = new Date();
        start.setDate(start.getDate() + 1);
        start.setHours(19, 0, 0, 0);
        em.create(Show, {
          id: randomUUID(),
          venue_id: id,
          title: kind === 'stadium' ? 'Community Cup · sample match' : 'A night at the movies',
          starts_at: start,
          ends_at: new Date(+start + 7200000),
        });
        await em.flush();
      }
    }
  });
}
