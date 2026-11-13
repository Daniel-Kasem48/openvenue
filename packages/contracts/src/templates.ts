import type { Layout, Resource, SceneObject, VenueKind } from './index';
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
  section: '',
  x,
  y,
  width,
  depth,
  capacity,
  price: 0,
  color: '#985864',
  elevation: 0,
  shape: 'rectangle',
  rotation: 0,
  accessible: false,
  ev: false,
});
export function makeObject(
  kind: SceneObject['kind'],
  x: number,
  y: number,
  overrides: Partial<SceneObject> = {},
): SceneObject {
  const dimensions: Record<SceneObject['kind'], [number, number, number, string]> = {
    label: [4, 2, 3, '#087ba5'],
    pitch: [36, 24, 2, '#438653'],
    plant: [0.8, 0.8, 1.5, '#56805a'],
    counter: [3, 1, 1.1, '#b88a60'],
    sofa: [2.4, 1, 0.85, '#ac805f'],
    partition: [3, 0.3, 1.6, '#d6c5aa'],
    column: [0.7, 0.7, 2.8, '#b4bab8'],
    door: [1.8, 0.3, 2.3, '#8eaeaa'],
    screen: [8, 0.4, 3.4, '#c5deec'],
    stairs: [2.5, 3, 1.2, '#969fa0'],
    ramp: [3, 6, 1.5, '#9aa4a5'],
    car: [1.8, 4.2, 1.35, '#547b91'],
    charger: [0.45, 0.5, 1.4, '#4a9580'],
    barrier: [3, 0.3, 1, '#e8be54'],
  };
  const [width, depth, height, color] = dimensions[kind];
  return {
    id: crypto.randomUUID(),
    kind,
    label: kind[0].toUpperCase() + kind.slice(1),
    x,
    y,
    width,
    depth,
    height,
    color,
    rotation: 0,
    ...overrides,
  };
}
export function makeTemplate(kind: VenueKind): Layout {
  if (kind === 'stadium') {
    const resources: Resource[] = [];
    const objects: SceneObject[] = [
      makeObject('pitch', 40, 38, { label: 'Football pitch' }),
      makeObject('door', 40, 75, { label: 'South entrance', width: 5 }),
      makeObject('door', 40, 1, { label: 'North entrance', width: 5 }),
      makeObject('screen', 67, 3, { label: 'Scoreboard', width: 10, height: 5 }),
      makeObject('counter', 5, 73, { label: 'Concessions', width: 6 }),
      makeObject('counter', 75, 73, { label: 'Ticket office', width: 6 }),
    ];
    const blocks = [
      ['60', '61', '62', '70', '71', '72'],
      ['10', '11', '12', '80', '81', '82'],
      ['40', '42', '43', '50', '52', '54'],
      ['23', '26', '20', '34', '32', '30'],
    ];
    for (const [side, section] of ['North', 'South', 'East', 'West'].entries()) {
      const rows = side === 1 ? 16 : 12,
        columns = side < 2 ? 18 : 20;
      for (let row = 0; row < rows; row++) {
        const elevation = 0.3 + row * 0.45;
        const x = side < 2 ? 40 : side === 2 ? 61 + row * 1.25 : 19 - row * 1.25;
        const y = side === 0 ? 23 - row * 1.25 : side === 1 ? 53 + row * 1.25 : 38;
        objects.push(
          makeObject('partition', x, y, {
            label: `${section} terrace ${row + 1}`,
            width: side < 2 ? 32 : 1.25,
            depth: side < 2 ? 1.25 : 25,
            height: elevation - 0.06,
            color: '#727876',
          }),
        );
        for (let col = 0; col < columns; col++) {
          const px = side < 2 ? 40 + (col - (columns - 1) / 2) * 1.7 : x;
          const py = side < 2 ? y : 38 + (col - (columns - 1) / 2) * 1.2;
          resources.push({
            ...item(
              'seat',
              `${section} ${String.fromCharCode(65 + row)}${col + 1}`,
              px,
              py,
              0.85,
              0.9,
            ),
            section:
              blocks[side][
                (row >= rows / 2 ? 3 : 0) + Math.min(2, Math.floor((col * 3) / columns))
              ],
            rotation: [180, 0, 270, 90][side],
            elevation,
            color: side === 1 || row % 4 !== 2 ? '#e6c52c' : '#343c3c',
            price: side < 2 ? 4500 - Math.min(row, 10) * 150 : 7000 - Math.min(row, 10) * 250,
            accessible: row === 0 && col === 0,
          });
        }
      }
      objects.push(
        makeObject(
          'stairs',
          side < 2 ? 58 : side === 2 ? 68 : 12,
          side === 0 ? 16 : side === 1 ? 62 : 52,
          {
            label: `${section} aisle steps`,
            width: side < 2 ? 2 : 16,
            depth: side < 2 ? 18 : 2,
            height: 5,
            color: '#c9c9bb',
          },
        ),
      );
    }
    for (const [side, numbers] of blocks.entries())
      for (const number of numbers) {
        const seats = resources.filter((r) => r.section === number);
        objects.push(
          makeObject(
            'label',
            seats.reduce((n, r) => n + r.x, 0) / seats.length,
            seats.reduce((n, r) => n + r.y, 0) / seats.length,
            {
              label: number,
              width: 4,
              depth: 2,
              height: Math.min(8, Math.max(...seats.map((r) => r.elevation)) + 1.5),
              color: side < 2 ? '#6b8c23' : '#087ba5',
            },
          ),
        );
      }
    return {
      version: 1,
      pricing: { mode: 'per-resource', currency: 'USD', amount: 0 },
      floors: [
        {
          id: crypto.randomUUID(),
          name: 'Westfalen-inspired arena · four rising stands',
          width: 80,
          depth: 76,
          resources,
          objects,
        },
      ],
    };
  }
  if (kind === 'restaurant')
    return {
      version: 1,
      pricing: { mode: 'free', currency: 'USD', amount: 0 },
      floors: [
        {
          id: crypto.randomUUID(),
          name: 'Bistro · dining & lounge',
          width: 24,
          depth: 20,
          resources: Array.from({ length: 12 }, (_, i) => ({
            ...item(
              'table',
              `Table ${i + 1}`,
              4 + (i % 3) * 5,
              3 + Math.floor(i / 3) * 4,
              i < 4 ? 1.8 : 2.4,
              1.8,
              i < 4 ? 2 : 4,
            ),
            shape: i < 4 ? 'round' : 'rectangle',
            accessible: i === 9,
          })),
          objects: [
            makeObject('counter', 21, 6, { label: 'Coffee & cocktail bar', width: 2.2, depth: 8 }),
            makeObject('counter', 21, 12, { label: 'Service station', width: 3.5, depth: 1.2 }),
            makeObject('partition', 18.2, 6, { label: 'Kitchen divider', width: 0.3, depth: 10 }),
            makeObject('counter', 19, 17, { label: 'Reception', width: 2.4 }),
            makeObject('sofa', 4, 18.5, { label: 'Waiting lounge', width: 4 }),
            makeObject('sofa', 9, 18.5, { label: 'Lounge sofa', width: 3 }),
            makeObject('door', 13, 19.7, { label: 'Main entrance' }),
            ...[
              [1, 1],
              [16.5, 1],
              [16.5, 16.5],
              [22, 18],
            ].map(([x, y]) => makeObject('plant', x, y)),
          ],
        },
      ],
    };
  if (kind === 'parking')
    return {
      version: 1,
      pricing: { mode: 'free', currency: 'USD', amount: 0 },
      floors: Array.from({ length: 2 }, (_, f) => ({
        id: crypto.randomUUID(),
        name: `Level ${f + 1} · ${f === 0 ? 'visitor & EV' : 'long stay'}`,
        width: 34,
        depth: 25,
        resources: Array.from({ length: 16 }, (_, i) => ({
          ...item(
            'space',
            `P${f + 1}-${String(i + 1).padStart(2, '0')}`,
            3 + (i % 8) * 3.4,
            i < 8 ? 4 : 17,
            2.6,
            5,
          ),
          accessible: i === 0,
          ev: i >= 6 && i < 8,
        })),
        objects: [
          makeObject('ramp', 31, 15, {
            label: f === 0 ? 'Ramp to level 2' : 'Ramp to exit',
            width: 4,
            depth: 10,
          }),
          makeObject('stairs', 31, 23, { label: 'Pedestrian stairs', width: 4 }),
          makeObject('counter', 31, 3, { label: 'Security booth', width: 3, depth: 2, height: 2 }),
          makeObject('barrier', 31, 7, { label: 'Entry barrier' }),
          makeObject('charger', 23.4, 1, { label: 'EV charger 1' }),
          makeObject('charger', 26.8, 1, { label: 'EV charger 2' }),
          ...[
            [1, 9],
            [28.5, 9],
            [1, 20],
            [28.5, 20],
          ].map(([x, y]) => makeObject('column', x, y)),
          ...[5, 12, 19].map((x, i) =>
            makeObject('car', x, 23, {
              label: `Staff vehicle ${i + 1}`,
              rotation: 90,
              color: ['#557d8c', '#c1a57d', '#655c79'][i],
            }),
          ),
        ],
      })),
    };
  return {
    version: 1,
    pricing: { mode: 'free', currency: 'USD', amount: 0 },
    floors: [
      {
        id: crypto.randomUUID(),
        name: 'Screen 1 · auditorium & foyer',
        width: 22,
        depth: 22,
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
        objects: [
          makeObject('screen', 11, 1.3, { label: 'Cinema screen', width: 15, height: 3.6 }),
          makeObject('partition', 5, 17, {
            label: 'Acoustic wall',
            width: 8,
            height: 2.4,
            color: '#434457',
          }),
          makeObject('partition', 18, 17, {
            label: 'Acoustic wall',
            width: 6,
            height: 2.4,
            color: '#434457',
          }),
          makeObject('door', 11.5, 17, { label: 'Auditorium entrance', width: 2.6 }),
          makeObject('counter', 4, 20, { label: 'Popcorn & drinks', width: 5, color: '#ad7a4c' }),
          makeObject('sofa', 18, 20, { label: 'Foyer lounge', width: 4, color: '#965b5c' }),
          makeObject('plant', 21, 19),
          makeObject('plant', 8, 20),
          makeObject('door', 11.5, 21.6, { label: 'Main entrance', width: 2.6 }),
          makeObject('stairs', 20.3, 11, {
            label: 'Side aisle steps',
            width: 1.6,
            depth: 9,
            height: 0.6,
          }),
        ],
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
      objects: (f.objects ?? []).map((o) => ({ ...o, id: crypto.randomUUID() })),
    })),
  };
}
