import { Pool, type PoolClient } from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { makeTemplate, type Layout, type VenueKind } from '@openvenue/contracts';

export async function syncResources(client: PoolClient, venueId: string, layout: Layout) {
  const resources = layout.floors.flatMap((f) => f.resources);
  const ids = resources.map((r) => r.id);
  const foreign = await client.query(
    'SELECT id FROM resources WHERE id=ANY($1::uuid[]) AND venue_id<>$2',
    [ids, venueId],
  );
  if (foreign.rowCount)
    throw Object.assign(new Error('Resource identifiers belong to another venue'), { status: 409 });
  await client.query(
    `DELETE FROM event_seat_blocks b USING shows s, resources r
     WHERE b.show_id=s.id AND b.resource_id=r.id AND r.venue_id=$1
       AND NOT (r.id=ANY($2::uuid[])) AND s.ends_at<=now()`,
    [venueId, ids],
  );
  await client.query('DELETE FROM resources WHERE venue_id=$1 AND NOT (id=ANY($2::uuid[]))', [
    venueId,
    ids,
  ]);
  for (const r of resources) {
    const result = await client.query(
      'INSERT INTO resources(id,venue_id,label) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label WHERE resources.venue_id=EXCLUDED.venue_id RETURNING id',
      [r.id, venueId, r.label],
    );
    if (!result.rowCount)
      throw Object.assign(new Error('Resource identifiers belong to another venue'), {
        status: 409,
      });
  }
}
export async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function initialize(pool: Pool) {
  const sql = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
  const pricingSql = await readFile(
    new URL('../migrations/003_stadium_pricing.sql', import.meta.url),
    'utf8',
  );
  const partySizeSql = await readFile(
    new URL('../migrations/002_party_size.sql', import.meta.url),
    'utf8',
  );
  const blocksSql = await readFile(
    new URL('../migrations/004_event_seat_blocks.sql', import.meta.url),
    'utf8',
  );
  const eventsSql = await readFile(
    new URL('../migrations/005_event_management.sql', import.meta.url),
    'utf8',
  );
  await transaction(pool, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(745921)');
    await client.query(sql);
    await client.query(partySizeSql);
    await client.query(pricingSql);
    await client.query(blocksSql);
    await client.query(eventsSql);
    if ((await client.query('SELECT id FROM venues LIMIT 1')).rowCount) return;
    for (const [kind, name] of [
      ['restaurant', 'The Greenhouse'],
      ['parking', 'Central Parking'],
      ['cinema', 'Studio Cinema'],
      ['stadium', 'Riverside Stadium'],
    ] as [VenueKind, string][]) {
      const id = randomUUID(),
        layout = makeTemplate(kind);
      await client.query('INSERT INTO venues(id,name,kind,layout) VALUES($1,$2,$3,$4)', [
        id,
        name,
        kind,
        JSON.stringify(layout),
      ]);
      await syncResources(client, id, layout);
      if (kind === 'cinema' || kind === 'stadium') {
        const start = new Date();
        start.setDate(start.getDate() + 1);
        start.setHours(19, 0, 0, 0);
        await client.query(
          'INSERT INTO shows(id,venue_id,title,starts_at,ends_at) VALUES($1,$2,$3,$4,$5)',
          [
            randomUUID(),
            id,
            kind === 'stadium' ? 'Community Cup · sample match' : 'A night at the movies',
            start,
            new Date(+start + 7200000),
          ],
        );
      }
    }
  });
}
