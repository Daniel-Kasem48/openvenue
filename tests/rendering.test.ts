import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { makeTemplate } from '@openvenue/contracts';
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
  expect(render()).toContain('>SCREEN</text>');
});
