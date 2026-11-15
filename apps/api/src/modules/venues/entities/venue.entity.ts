import { EntitySchema, type EntityRepositoryType, type OptionalProps } from '@mikro-orm/core';
import type { Layout, VenueKind } from '@openvenue/contracts';
import { VenuesRepository } from '../repositories/venues.repository';

export interface Venue {
  [EntityRepositoryType]?: VenuesRepository;
  [OptionalProps]?: 'revision' | 'archived_at';
  id: string;
  name: string;
  kind: VenueKind;
  layout: Layout;
  revision: number;
  archived_at: Date | null;
}
export const Venue = new EntitySchema<Venue>({
  name: 'Venue',
  repository: () => VenuesRepository,
  tableName: 'venues',
  properties: {
    id: { type: 'uuid', primary: true },
    name: { type: 'text' },
    kind: { type: 'string' },
    layout: { type: 'json' },
    revision: { type: 'integer', default: 1 },
    archived_at: { type: 'Date', columnType: 'timestamptz', nullable: true },
  },
});
