import { expect, it } from 'vitest';
import { layoutSchema, makeTemplate } from '@openvenue/contracts';
import { scopedResourceIds, removeTier, assignTier } from '../apps/web/src/priceTiers';

it('paints only the requested seat, row or block and keeps coordinates unchanged', () => {
  const layout = makeTemplate('stadium');
  const floor = layout.floors[0];
  const seat = floor.resources[0];
  const tier = { id: crypto.randomUUID(), name: 'Premium', color: '#123456', amount: 2000 };
  layout.pricing = { ...layout.pricing, mode: 'tiers', tiers: [tier] };
  expect(scopedResourceIds(floor, seat.id, 'seat')).toEqual([seat.id]);
  const row = scopedResourceIds(floor, seat.id, 'row');
  const block = scopedResourceIds(floor, seat.id, 'block');
  expect(row.length).toBeGreaterThan(1);
  expect(block.length).toBeGreaterThan(row.length);
  const painted = assignTier(layout, block, tier.id);
  expect(layout.floors[0].resources.every((r) => !r.tierId)).toBe(true);
  for (const [i, resource] of painted.floors[0].resources.entries()) {
    expect(resource.tierId).toBe(block.includes(resource.id) ? tier.id : undefined);
    expect([resource.x, resource.y]).toEqual([floor.resources[i].x, floor.resources[i].y]);
  }
  expect(layoutSchema.safeParse(painted).success).toBe(true);
  expect(assignTier(painted, row, '').floors[0].resources.filter((r) => r.tierId)).toHaveLength(
    block.length - row.length,
  );
  expect(scopedResourceIds(floor, 'missing', 'block')).toEqual([]);
});

it('deleting a tier clears all assignments but preserves other tiers and fallback prices', () => {
  const layout = makeTemplate('parking');
  const first = { id: crypto.randomUUID(), name: 'A', color: '#123456', amount: 2000 };
  const second = { ...first, id: crypto.randomUUID(), name: 'B' };
  layout.pricing = { ...layout.pricing, mode: 'tiers', tiers: [first, second] };
  for (const floor of layout.floors) {
    floor.resources[0].tierId = first.id;
    floor.resources[0].price = 0;
    floor.resources[1].tierId = second.id;
  }
  const result = removeTier(layout, first.id);
  expect(result.pricing.tiers).toEqual([second]);
  for (const floor of result.floors) {
    expect(floor.resources[0].tierId).toBeUndefined();
    expect(floor.resources[0].price).toBe(0);
    expect(floor.resources[1].tierId).toBe(second.id);
  }
  expect(layoutSchema.safeParse(result).success).toBe(true);
});
