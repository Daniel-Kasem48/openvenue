import { EntitySchema, type EntityRepositoryType, type OptionalProps } from '@mikro-orm/core';
import { ShowsRepository } from '../repositories/shows.repository';

export interface Show {
  [EntityRepositoryType]?: ShowsRepository;
  [OptionalProps]?: 'price_multiplier';
  id: string;
  venue_id: string;
  title: string;
  starts_at: Date;
  ends_at: Date;
  price_multiplier: number;
}
export const Show = new EntitySchema<Show>({
  name: 'Show',
  repository: () => ShowsRepository,
  tableName: 'shows',
  properties: {
    id: { type: 'uuid', primary: true },
    venue_id: { kind: 'm:1', type: 'Venue', mapToPk: true, fieldName: 'venue_id' },
    title: { type: 'text' },
    starts_at: { type: 'Date', columnType: 'timestamptz' },
    ends_at: { type: 'Date', columnType: 'timestamptz' },
    price_multiplier: {
      type: 'decimal',
      precision: 4,
      scale: 2,
      runtimeType: 'number',
      default: 1,
    },
  },
});
