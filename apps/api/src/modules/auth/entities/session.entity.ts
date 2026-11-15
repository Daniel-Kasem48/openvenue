import { EntitySchema, type OptionalProps } from '@mikro-orm/core';

export interface Session {
  [OptionalProps]?: 'user_id';
  token_hash: string;
  expires_at: Date;
  user_id: string | null;
}
export const Session = new EntitySchema<Session>({
  name: 'Session',
  tableName: 'sessions',
  properties: {
    token_hash: { type: 'text', primary: true },
    expires_at: { type: 'Date', columnType: 'timestamptz' },
    user_id: { kind: 'm:1', type: 'User', mapToPk: true, fieldName: 'user_id', nullable: true },
  },
});
