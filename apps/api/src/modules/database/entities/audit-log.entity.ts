import { EntitySchema, type OptionalProps } from '@mikro-orm/core';

export interface AuditLog {
  [OptionalProps]?: 'user_id' | 'at';
  id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  at: Date;
}
export const AuditLog = new EntitySchema<AuditLog>({
  name: 'AuditLog',
  tableName: 'audit_log',
  properties: {
    id: { type: 'uuid', primary: true },
    user_id: { kind: 'm:1', type: 'User', mapToPk: true, fieldName: 'user_id', nullable: true },
    action: { type: 'text' },
    entity: { type: 'text' },
    entity_id: { type: 'uuid' },
    at: { type: 'Date', columnType: 'timestamptz', defaultRaw: 'now()' },
  },
});
