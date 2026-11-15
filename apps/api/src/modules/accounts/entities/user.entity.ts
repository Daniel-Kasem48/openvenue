import { EntitySchema, type OptionalProps } from '@mikro-orm/core';

export interface User {
  [OptionalProps]?: 'created_at' | 'disabled_at';
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: 'owner' | 'manager' | 'staff';
  created_at: Date;
  disabled_at: Date | null;
}
export const User = new EntitySchema<User>({
  name: 'User',
  tableName: 'users',
  properties: {
    id: { type: 'uuid', primary: true },
    email: { type: 'text' },
    name: { type: 'text' },
    password_hash: { type: 'text' },
    role: { type: 'string' },
    created_at: { type: 'Date', columnType: 'timestamptz', defaultRaw: 'now()' },
    disabled_at: { type: 'Date', columnType: 'timestamptz', nullable: true },
  },
});
