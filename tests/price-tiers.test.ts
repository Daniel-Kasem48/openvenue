import { describe, expect, it } from 'vitest';
import { layoutSchema, makeTemplate, reservationPrice } from '@openvenue/contracts';

const tierId = 'b691b093-f226-4b65-9e9b-7890d023c450';
function tierLayout() {
  const layout = makeTemplate('cinema');
  return {
    ...layout,
    pricing: {
      mode: 'tiers' as const,
      currency: 'USD' as const,
      amount: 900,
      tiers: [{ id: tierId, name: 'Premium', color: '#345678', amount: 2500 }],
    },
  };
}

describe('price tier contract', () => {
  it('resolves tier, resource and uniform fallback without losing explicit zero', () => {
    const layout = tierLayout();
    const base = layout.floors[0].resources[0];
    expect(reservationPrice(layout, { ...base, tierId, price: 700 })).toBe(2500);
    expect(reservationPrice(layout, { ...base, price: 700 })).toBe(700);
    expect(reservationPrice(layout, { ...base, price: 0 })).toBe(0);
    expect(reservationPrice(layout, { ...base, price: undefined })).toBe(900);
    layout.pricing.tiers[0].amount = 0;
    expect(reservationPrice(layout, { ...base, tierId, price: 700 })).toBe(0);
    for (const [mode, expected] of [
      ['free', 0],
      ['uniform', 900],
      ['per-resource', 700],
    ] as const)
      expect(
        reservationPrice(
          { ...layout, pricing: { ...layout.pricing, mode } },
          { ...base, tierId, price: 700 },
        ),
      ).toBe(expected);
  });
  it('parses old layouts without tiers and preserves missing resource prices', () => {
    const old = makeTemplate('restaurant');
    delete old.floors[0].resources[0].price;
    const parsed = layoutSchema.parse(old);
    expect(parsed.floors[0].resources[0].price).toBeUndefined();
    expect(
      reservationPrice(
        { ...parsed, pricing: { ...parsed.pricing, mode: 'per-resource' } },
        parsed.floors[0].resources[0],
      ),
    ).toBe(0);
  });
  it('accepts valid assignments and rejects duplicate, excessive or malformed tiers', () => {
    const layout = tierLayout();
    layout.floors[0].resources[0].tierId = tierId;
    expect(layoutSchema.safeParse(layout).success).toBe(true);
    for (const patch of [
      { name: ' ' },
      { color: 'red' },
      { amount: -1 },
      { amount: 1.5 },
      { amount: 100000001 },
    ])
      expect(
        layoutSchema.safeParse({
          ...layout,
          pricing: { ...layout.pricing, tiers: [{ ...layout.pricing.tiers[0], ...patch }] },
        }).success,
      ).toBe(false);
    expect(
      layoutSchema.safeParse({
        ...layout,
        pricing: { ...layout.pricing, tiers: Array(2).fill(layout.pricing.tiers[0]) },
      }).success,
    ).toBe(false);
    expect(
      layoutSchema.safeParse({
        ...layout,
        pricing: {
          ...layout.pricing,
          tiers: Array.from({ length: 13 }, () => ({
            ...layout.pricing.tiers[0],
            id: crypto.randomUUID(),
          })),
        },
      }).success,
    ).toBe(false);
    layout.floors[0].resources[0].tierId = crypto.randomUUID();
    expect(layoutSchema.safeParse(layout).success).toBe(false);
  });
});
