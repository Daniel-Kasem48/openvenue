import type { Layout, Resource, VenueKind } from './index';
const item = (
  kind: Resource['kind'],
  label: string,
  x: number,
  y: number,
  width: number,
  depth: number,
  capacity = 1,
): Resource => ({
  id: crypto.randomUUID(),
  kind,
  label,
  x,
  y,
  width,
  depth,
  capacity,
  rotation: 0,
  accessible: false,
  ev: false,
});
export function makeTemplate(kind: VenueKind): Layout {
  if (kind === 'restaurant')
    return {
      version: 1,
      floors: [
        {
          id: crypto.randomUUID(),
          name: 'Dining room',
          width: 18,
          depth: 14,
          resources: Array.from({ length: 12 }, (_, i) =>
            item(
              'table',
              `Table ${i + 1}`,
              3 + (i % 4) * 4,
              3 + Math.floor(i / 4) * 4,
              2,
              1.6,
              i < 4 ? 2 : 4,
            ),
          ),
        },
      ],
    };
  if (kind === 'parking')
    return {
      version: 1,
      floors: Array.from({ length: 2 }, (_, floor) => ({
        id: crypto.randomUUID(),
        name: `Level ${floor + 1}`,
        width: 30,
        depth: 20,
        resources: Array.from({ length: 16 }, (_, i) => ({
          ...item(
            'space',
            `P${floor + 1}-${String(i + 1).padStart(2, '0')}`,
            3 + (i % 8) * 3.4,
            i < 8 ? 4 : 16,
            2.6,
            5,
          ),
          accessible: i === 0,
          ev: i >= 6 && i < 8,
        })),
      })),
    };
  return {
    version: 1,
    floors: [
      {
        id: crypto.randomUUID(),
        name: 'Screen 1',
        width: 20,
        depth: 16,
        resources: Array.from({ length: 48 }, (_, i) => ({
          ...item(
            'seat',
            `${String.fromCharCode(65 + Math.floor(i / 8))}${(i % 8) + 1}`,
            4 + (i % 8) * 1.5 + (i % 8 >= 4 ? 1.5 : 0),
            5 + Math.floor(i / 8) * 1.8,
            0.9,
            1,
          ),
          accessible: i < 2,
        })),
      },
    ],
  };
}
export function cloneLayout(layout: Layout): Layout {
  return {
    ...layout,
    floors: layout.floors.map((f) => ({
      ...f,
      id: crypto.randomUUID(),
      resources: f.resources.map((r) => ({ ...r, id: crypto.randomUUID() })),
    })),
  };
}
