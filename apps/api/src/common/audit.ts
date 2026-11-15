import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Principal } from '../auth/credentials';
export async function audit(
  client: PoolClient,
  principal: Principal,
  action: string,
  entity: string,
  id: string,
) {
  await client.query(
    'INSERT INTO audit_log(id,user_id,action,entity,entity_id) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), principal.userId, action, entity, id],
  );
}
