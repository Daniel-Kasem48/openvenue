import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { Principal } from '../auth/credentials';
import { AuditLog } from '../database/entities';
export async function audit(
  em: EntityManager,
  principal: Principal,
  action: string,
  entity: string,
  id: string,
) {
  em.create(AuditLog, {
    id: randomUUID(),
    user_id: principal.userId,
    action,
    entity,
    entity_id: id,
  });
  await em.flush();
}
