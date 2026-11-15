import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { makeTemplate, venueSchema } from '@openvenue/contracts';
import { LayoutThumbnail } from '../apps/web/src/LayoutThumbnail';

it('draws the first floor with authored colors, centered rotation and round geometry', () => {
  const layout = makeTemplate('restaurant');
  const floor = layout.floors[0];
  floor.resources = [
    {
      ...floor.resources[0],
      x: 7,
      y: 8,
      width: 2,
      depth: 2,
      rotation: 45,
      shape: 'round',
      color: '#123456',
    },
  ];
  floor.objects = [
    {
      ...floor.objects[0],
      kind: 'counter',
      x: 12,
      y: 10,
      width: 4,
      depth: 2,
      rotation: 90,
      color: '#abcdef',
    },
  ];
  layout.floors.push({
    ...floor,
    id: crypto.randomUUID(),
    resources: [{ ...floor.resources[0], id: crypto.randomUUID(), color: '#fedcba' }],
    objects: [],
  });
  const venue = {
    id: crypto.randomUUID(),
    name: 'Preview',
    kind: 'restaurant' as const,
    layout,
    revision: 1,
  };
  const markup = renderToStaticMarkup(createElement(LayoutThumbnail, { venue }));
  expect(markup).toContain(`viewBox="0 0 ${floor.width} ${floor.depth}"`);
  expect(markup).toContain('aria-hidden="true"');
  expect(markup).toContain(
    '<ellipse cx="7" cy="8" rx="1" ry="1" fill="#123456" transform="rotate(45 7 8)"',
  );
  expect(markup).toContain(
    '<rect x="10" y="9" width="4" height="2" fill="#abcdef" transform="rotate(90 12 10)"',
  );
  expect(markup).not.toContain('#fedcba');
  expect(markup).not.toContain('tabindex');
  expect(venueSchema.safeParse(venue).success).toBe(true);
  expect(venueSchema.safeParse({ ...venue, nextEventAt: null }).success).toBe(true);
  expect(venueSchema.safeParse({ ...venue, nextEventAt: 'not a date' }).success).toBe(false);
});
