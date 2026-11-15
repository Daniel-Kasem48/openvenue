import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/postgresql';
import type { Principal } from '../modules/auth/credentials';
import { AuditLog } from '../modules/database/entities';
export async function audit(
  em: EntityManager,
  principal: Principal,
  action: string,
  entity: string,
  id: string,
) {
  em.getRepository(AuditLog).create({
    id: randomUUID(),
    user_id: principal.userId,
    action,
    entity,
    entity_id: id,
  });
  await em.flush();
}
