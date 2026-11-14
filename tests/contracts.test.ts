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

it('seeds a dense stadium with progressively higher editable rows', () => {
  const floor = makeTemplate('stadium').floors[0];
  expect(floor.resources).toHaveLength(984);
  for (const section of ['North', 'South', 'East', 'West']) {
    const firstSeats = floor.resources.filter(
      (r) => r.label.startsWith(section + ' ') && / [A-Z]1$/.test(r.label),
    );
    expect(firstSeats.length).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < firstSeats.length; i++)
      expect(firstSeats[i].elevation).toBeGreaterThan(firstSeats[i - 1].elevation);
  }
  expect(floor.objects.some((o) => o.label === 'South terrace 16')).toBe(true);
});

it('seeds editable stadium block labels matching every seat section', () => {
  const layout = makeTemplate('stadium'),
    floor = layout.floors[0];
  const labels = floor.objects.filter((o) => o.kind === 'label');
  expect(labels).toHaveLength(24);
  expect(new Set(labels.map((o) => o.label)).size).toBe(24);
  expect(floor.resources.every((r) => labels.some((o) => o.label === r.section))).toBe(true);
  expect(labels.map((o) => o.label)).toEqual(
    expect.arrayContaining(['10', '80', '60', '70', '40', '50', '23', '34']),
  );
  expect(layoutSchema.safeParse(layout).success).toBe(true);
});

it('identifies legacy seats and provides explicit block, row and seat locations', async () => {
  const { seatLocation, seatIdentity, seatRows } = await import('@openvenue/contracts');
  const floor = makeTemplate('stadium').floors[0];
  const seat = floor.resources[0];
  expect(seat.row).toBe('A');
  expect(seat.seatNumber).toBe(1);
  expect(seatLocation(seat)).toBe('Block 60 · Row A · Seat 1');
  const legacy = { ...seat, row: undefined, seatNumber: undefined, label: 'North B12' };
  expect(seatIdentity(legacy)).toEqual({ row: 'B', seatNumber: 12 });
  expect(seatLocation({ ...legacy, label: 'Custom seat' })).toBe('Block 60 · Custom seat');
  const rows = seatRows(floor);
  expect(rows.find((r) => r.section === '60' && r.row === 'A')!.seats).toHaveLength(6);
  const locations = floor.resources.map(seatLocation);
  expect(new Set(locations).size).toBe(locations.length);
});

it('keeps legacy unnumbered stands separate and rejects duplicate explicit seat addresses', async () => {
  const { seatRows, seatLocation } = await import('@openvenue/contracts');
  const layout = makeTemplate('stadium'),
    floor = layout.floors[0];
  const a = {
    ...floor.resources[0],
    section: '',
    row: undefined,
    seatNumber: undefined,
    label: 'North A1',
  };
  const b = {
    ...floor.resources[1],
    section: '',
    row: undefined,
    seatNumber: undefined,
    label: 'South A1',
  };
  expect(seatRows({ ...floor, resources: [a, b] })).toHaveLength(2);
  expect(seatLocation(a)).toContain('North');
  floor.resources[1].seatNumber = floor.resources[0].seatNumber;
  expect(layoutSchema.safeParse(layout).success).toBe(false);
});

it('rejects a new explicit address that collides with an untouched legacy seat', () => {
  const layout = makeTemplate('stadium');
  const seats = layout.floors[0].resources;
  delete seats[0].row;
  delete seats[0].seatNumber;
  seats[1].row = 'A';
  seats[1].seatNumber = 1;
  expect(layoutSchema.safeParse(layout).success).toBe(false);
});
