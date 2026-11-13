import { describe, expect, it } from 'vitest';
import { cloneLayout, layoutSchema, makeTemplate } from '@openvenue/contracts';
describe('venue templates and layout boundary', () => {
  for (const kind of ['restaurant', 'parking', 'cinema', 'stadium'] as const) {
    it(`provides a valid independent ${kind} template`, () => {
      const a = makeTemplate(kind),
        b = makeTemplate(kind);
      expect(layoutSchema.safeParse(a).success).toBe(true);
      expect(a.floors[0].resources.length).toBeGreaterThan(0);
      expect(a.floors[0].resources[0].id).not.toBe(b.floors[0].resources[0].id);
    });
  }
  it('rejects duplicate identifiers and out-of-floor geometry', () => {
    const map = makeTemplate('restaurant');
    map.floors[0].resources.push({ ...map.floors[0].resources[0] });
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

it('normalizes UUID case before checking uniqueness', () => {
  const layout = makeTemplate('restaurant');
  const id = layout.floors[0].resources[0].id;
  layout.floors[0].resources[0].id = id.toUpperCase();
  const parsed = layoutSchema.parse(layout);
  expect(parsed.floors[0].resources[0].id).toBe(id.toLowerCase());
  layout.floors[0].resources.push({ ...layout.floors[0].resources[0], id: id.toLowerCase() });
  expect(layoutSchema.safeParse(layout).success).toBe(false);
});

it('provides realistic furnished templates and clones every object independently', () => {
  for (const kind of ['restaurant', 'parking', 'cinema', 'stadium'] as const) {
    const layout = makeTemplate(kind);
    expect(cloneLayout(layout).floors[0].objects[0].id).not.toBe(layout.floors[0].objects[0].id);
    expect(layout.floors[0].objects?.length).toBeGreaterThan(5);
    expect(new Set(layout.floors[0].objects.map((o) => o.kind)).size).toBeGreaterThan(3);
    expect(layoutSchema.safeParse(layout).success).toBe(true);
  }
});
it('supports old layouts and validates scenery bounds and unique IDs', () => {
  const old = makeTemplate('restaurant');
  delete (old.floors[0] as any).objects;
  expect(layoutSchema.parse(old).floors[0].objects).toEqual([]);
  const scene = makeTemplate('cinema');
  scene.floors[0].objects[0].id = scene.floors[0].resources[0].id;
  expect(layoutSchema.safeParse(scene).success).toBe(false);
  scene.floors[0].objects[0].id = crypto.randomUUID();
  scene.floors[0].objects[0].x = 500;
  expect(layoutSchema.safeParse(scene).success).toBe(false);
});

it('faces each stadium stand toward the pitch', () => {
  const floor = makeTemplate('stadium').floors[0];
  for (const r of floor.resources) {
    const angle = (r.rotation * Math.PI) / 180;
    const inward = [floor.width / 2 - r.x, floor.depth / 2 - r.y];
    expect(Math.sin(angle) * inward[0] - Math.cos(angle) * inward[1]).toBeGreaterThan(0);
  }
});
