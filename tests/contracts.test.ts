import { describe, expect, it } from 'vitest';
import { layoutSchema, makeTemplate } from '@openvenue/contracts';
describe('venue templates and layout boundary', () => {
  for (const kind of ['restaurant', 'parking', 'cinema'] as const) {
    it(`provides a valid independent ${kind} template`, () => {
      const a = makeTemplate(kind), b = makeTemplate(kind);
      expect(layoutSchema.safeParse(a).success).toBe(true);
      expect(a.floors[0].resources.length).toBeGreaterThan(0);
      expect(a.floors[0].resources[0].id).not.toBe(b.floors[0].resources[0].id);
    });
  }
  it('rejects duplicate identifiers and out-of-floor geometry', () => {
    const map = makeTemplate('restaurant');
    map.floors[0].resources.push({...map.floors[0].resources[0]});
    expect(layoutSchema.safeParse(map).success).toBe(false);
    map.floors[0].resources.pop();
    map.floors[0].resources[0].x = 10000;
    expect(layoutSchema.safeParse(map).success).toBe(false);
  });
  it('rejects blank names and nonfinite dimensions', () => {
    const map = makeTemplate('parking');
    map.floors[0].name = ' ';
    expect(layoutSchema.safeParse(map).success).toBe(false);
    map.floors[0].width = Infinity;
    expect(layoutSchema.safeParse(map).success).toBe(false);
  });
});
