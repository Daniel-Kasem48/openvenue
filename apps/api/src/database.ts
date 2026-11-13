import { Pool, type PoolClient } from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { makeTemplate, type Layout, type VenueKind } from '@openvenue/contracts';

export async function syncResources(client: PoolClient, venueId: string, layout: Layout) {
  const resources = layout.floors.flatMap(f => f.resources);
  const ids = resources.map(r => r.id);
  const foreign = await client.query('SELECT id FROM resources WHERE id=ANY($1::uuid[]) AND venue_id<>$2', [ids, venueId]);
  if (foreign.rowCount) throw Object.assign(new Error('Resource identifiers belong to another venue'), {status: 409});
  await client.query('DELETE FROM resources WHERE venue_id=$1 AND NOT (id=ANY($2::uuid[]))', [venueId, ids]);
  for (const r of resources) await client.query('INSERT INTO resources(id,venue_id,label) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label', [r.id, venueId, r.label]);
}
export async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function initialize(pool: Pool) {
  const sql = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
  await transaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock(745921)');
    await client.query(sql);
    if ((await client.query('SELECT id FROM venues LIMIT 1')).rowCount) return;
    for (const [kind, name] of [['restaurant','The Greenhouse'],['parking','Central Parking'],['cinema','Studio Cinema']] as [VenueKind,string][]) {
      const id = randomUUID(), layout = makeTemplate(kind);
      await client.query('INSERT INTO venues(id,name,kind,layout) VALUES($1,$2,$3,$4)', [id,name,kind,JSON.stringify(layout)]);
      await syncResources(client, id, layout);
      if (kind === 'cinema') {
        const start = new Date(); start.setDate(start.getDate()+1); start.setHours(19,0,0,0);
        await client.query('INSERT INTO shows VALUES($1,$2,$3,$4,$5)', [randomUUID(),id,'A night at the movies',start,new Date(+start+7200000)]);
      }
    }
  });
}
