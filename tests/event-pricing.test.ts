import { expect, it } from 'vitest';
import * as contracts from '@openvenue/contracts';

it('resolves event overrides before multipliers and rounds each seat in minor units', () => {
  const layout = contracts.makeTemplate('cinema');
  const tierId = crypto.randomUUID();
  layout.pricing = {
    mode: 'tiers',
    currency: 'USD',
    amount: 200,
    tiers: [{ id: tierId, name: 'Base', color: '#123456', amount: 5 }],
  };
  const seat = { ...layout.floors[0].resources[0], tierId, price: 50 };
  const resolve = contracts.reservationPrice;
  expect(resolve(layout, seat, { multiplier: 1.3, overrides: [] })).toBe(7);
  expect(
    [seat, seat].reduce(
      (sum, resource) => sum + resolve(layout, resource, { multiplier: 1.3, overrides: [] }),
      0,
    ),
  ).toBe(14);
  expect(resolve(layout, seat, { multiplier: 1.3, overrides: [{ tierId, amount: 0 }] })).toBe(0);
  expect(resolve(layout, seat, { multiplier: 1.3, overrides: [{ tierId, amount: 123 }] })).toBe(
    123,
  );
  expect(resolve(layout, { ...seat, tierId: undefined }, { multiplier: 1.3, overrides: [] })).toBe(
    65,
  );
  expect(resolve(layout, seat, { multiplier: 0, overrides: [] })).toBe(0);
  expect(resolve(layout, seat)).toBe(5);
  expect(
    resolve({ ...layout, pricing: { ...layout.pricing, mode: 'free' } }, seat, {
      multiplier: 1.3,
      overrides: [{ tierId, amount: 123 }],
    }),
  ).toBe(0);
  expect(() =>
    resolve(
      { ...layout, pricing: { ...layout.pricing, mode: 'uniform', amount: 100000000 } },
      seat,
      { multiplier: 1.01, overrides: [] },
    ),
  ).toThrow();
});

it('bounds event multipliers, precision, amounts and duplicate tier overrides', () => {
  const schema = contracts.eventPricingSchema;
  const override = { tierId: crypto.randomUUID(), amount: 0 };
  expect(schema.safeParse({ multiplier: 1.3, overrides: [override] }).success).toBe(true);
  for (const multiplier of [-1, 100, 1.001, Infinity, NaN])
    expect(schema.safeParse({ multiplier, overrides: [] }).success).toBe(false);
  for (const amount of [-1, 0.5, 100000001])
    expect(schema.safeParse({ multiplier: 1, overrides: [{ ...override, amount }] }).success).toBe(
      false,
    );
  expect(schema.safeParse({ multiplier: 1, overrides: [override, override] }).success).toBe(false);
});
