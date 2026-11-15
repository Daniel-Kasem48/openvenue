import { EntitySchema } from '@mikro-orm/core';

export interface ShowPrice {
  show_id: string;
  tier_id: string;
  amount: number;
}
export const ShowPrice = new EntitySchema<ShowPrice>({
  name: 'ShowPrice',
  tableName: 'show_prices',
  properties: {
    show_id: { kind: 'm:1', type: 'Show', mapToPk: true, fieldName: 'show_id', primary: true },
    tier_id: { type: 'text', primary: true },
    amount: { type: 'integer' },
  },
});
