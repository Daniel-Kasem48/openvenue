import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { makeTemplate } from '@openvenue/contracts';
import { stadiumSeatParts } from '../apps/web/src/scene/StadiumSeats';
import Map2D from '../apps/web/src/Map2D';
it('uses the editable cinema screen without leaving the legacy screen behind', () => {
  const floor = makeTemplate('cinema').floors[0];
  floor.objects.find((o) => o.kind === 'screen')!.y = 3;
  const render = () =>
    renderToStaticMarkup(
      createElement(Map2D, {
        floor,
        kind: 'cinema',
        busy: [],
        editing: false,
        onSelect: () => {},
        onMove: () => {},
      }),
    );
  expect(render()).not.toContain('>SCREEN</text>');
  floor.objects = [];
  expect(render()).not.toContain('>SCREEN</text>');
});

it('renders a stadium pitch only from editable scene objects', () => {
  const floor = makeTemplate('stadium').floors[0];
  const render = () =>
    renderToStaticMarkup(
      createElement(Map2D, {
        floor,
        kind: 'stadium',
        busy: [],
        editing: false,
        onSelect: () => {},
        onMove: () => {},
      }),
    );
  expect(render()).toContain('Football pitch markings');
  floor.objects = floor.objects.filter((o) => o.kind !== 'pitch');
  expect(render()).not.toContain('Football pitch markings');
});

it('supports elevated seats even when saved stadiums have no terrace objects', () => {
  const seat = makeTemplate('stadium').floors[0].resources[0];
  for (const elevation of [0, 0.6, 1.2, 7.05]) {
    const r = { ...seat, elevation };
    const [y, , w, h, d] = stadiumSeatParts(r)[3];
    expect(r.elevation + y - h / 2).toBeCloseTo(0);
    expect(r.elevation + y + h / 2).toBeCloseTo(elevation);
    expect(w * r.width).toBeGreaterThanOrEqual(r.width);
    expect(d * r.depth).toBeGreaterThanOrEqual(r.depth);
  }
});

it('shows block numbers and compact seat labels with a tight keyboard focus marker', () => {
  const floor = makeTemplate('stadium').floors[0];
  const markup = renderToStaticMarkup(
    createElement(Map2D, {
      floor,
      kind: 'stadium',
      selected: floor.resources[0].id,
      busy: [],
      editing: false,
      onSelect: () => {},
      onMove: () => {},
    }),
  );
  expect(markup).toContain('Block 60');
  expect(markup).toContain('>60</text>');
  expect(markup).toContain('>A1</text>');
  expect(markup).not.toContain('>North A1</text>');
  expect(markup).toContain('class="resource-focus-ring"');
  expect(markup).toContain('vector-effect="non-scaling-stroke"');
});

it('renders row letters and distinguishes blocked seats from bookings', () => {
  const floor = makeTemplate('stadium').floors[0];
  const markup = renderToStaticMarkup(
    createElement(Map2D, {
      floor,
      kind: 'stadium',
      busy: [floor.resources[0].id],
      blocked: [floor.resources[0].id],
      editing: false,
      onSelect: () => {},
      onMove: () => {},
    }),
  );
  expect(markup).toContain('Row A · Block 60');
  expect(markup).toContain('Block 60 · Row A · Seat 1');
  expect(markup).toContain('Blocked for this event');
  expect(markup).toContain('#c6cbd1');
});

it('uses decorative SVG icons without changing map control names', () => {
  const markup = renderToStaticMarkup(
    createElement(Map2D, {
      floor: makeTemplate('restaurant').floors[0],
      kind: 'restaurant',
      busy: [],
      editing: false,
      onSelect: () => {},
      onMove: () => {},
    }),
  );
  expect(markup).toMatch(/aria-label="Zoom out"[^>]*><svg[^>]*aria-hidden="true"/);
  expect(markup).toMatch(/aria-label="Zoom in"[^>]*><svg[^>]*aria-hidden="true"/);
});
