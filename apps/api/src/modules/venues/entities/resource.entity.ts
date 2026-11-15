import { EntitySchema } from '@mikro-orm/core';

export interface Resource {
  id: string;
  venue_id: string;
  label: string;
}
export const Resource = new EntitySchema<Resource>({
  name: 'Resource',
  tableName: 'resources',
  properties: {
    id: { type: 'uuid', primary: true },
    venue_id: { kind: 'm:1', type: 'Venue', mapToPk: true, fieldName: 'venue_id' },
    label: { type: 'text' },
  },
});
