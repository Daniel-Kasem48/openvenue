import { EntitySchema, type OptionalProps } from '@mikro-orm/core';

export interface EventSeatBlock {
  [OptionalProps]?: 'created_at';
  show_id: string;
  resource_id: string;
  reason: string;
  created_at: Date;
}
export const EventSeatBlock = new EntitySchema<EventSeatBlock>({
  name: 'EventSeatBlock',
  tableName: 'event_seat_blocks',
  properties: {
    show_id: { kind: 'm:1', type: 'Show', mapToPk: true, fieldName: 'show_id', primary: true },
    resource_id: {
      kind: 'm:1',
      type: 'Resource',
      mapToPk: true,
      fieldName: 'resource_id',
      primary: true,
    },
    reason: { type: 'text' },
    created_at: { type: 'Date', columnType: 'timestamptz', defaultRaw: 'now()' },
  },
});
