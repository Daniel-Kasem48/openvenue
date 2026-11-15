import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { makeTemplate } from '@openvenue/contracts';
import Map2D from '../apps/web/src/Map2D';

it('shows tier colors while selected, blocked and reserved states retain priority', () => {
  const floor = makeTemplate('cinema').floors[0];
  floor.resources = floor.resources.slice(0, 1);
  const id = floor.resources[0].id;
  const render = (state = {}) =>
    renderToStaticMarkup(
      createElement(Map2D, {
        floor,
        kind: 'cinema',
        editing: false,
        busy: [],
        priceColors: { [id]: '#123abc' },
        onSelect: () => {},
        onMove: () => {},
        ...state,
      } as any),
    );
  expect(render()).toContain('#123abc');
  for (const state of [{ selected: id }, { blocked: [id] }, { busy: [id] }])
    expect(render(state)).not.toContain('#123abc');
});
