import { seatIdentity, seatSection, type Floor, type Layout } from '@openvenue/contracts';
export type SelectionScope = 'seat' | 'row' | 'block';

export function scopedResourceIds(floor: Floor, id: string, scope: SelectionScope): string[] {
  const seat = floor.resources.find((resource) => resource.id === id);
  if (!seat) return [];
  if (scope === 'seat') return [id];
  const row = seatIdentity(seat).row;
  return floor.resources
    .filter(
      (resource) =>
        resource.kind === 'seat' &&
        seatSection(resource) === seatSection(seat) &&
        (scope === 'block' ? !!seatSection(seat) : !!row && seatIdentity(resource).row === row),
    )
    .map((resource) => resource.id);
}

export function assignTier(layout: Layout, ids: string[], tierId: string): Layout {
  const selected = new Set(ids);
  return {
    ...layout,
    floors: layout.floors.map((floor) => ({
      ...floor,
      resources: floor.resources.map((resource) =>
        selected.has(resource.id) ? { ...resource, tierId: tierId || undefined } : resource,
      ),
    })),
  };
}

export function removeTier(layout: Layout, tierId: string): Layout {
  const cleared = assignTier(
    layout,
    layout.floors.flatMap((floor) =>
      floor.resources
        .filter((resource) => resource.tierId === tierId)
        .map((resource) => resource.id),
    ),
    '',
  );
  return {
    ...cleared,
    pricing: {
      ...cleared.pricing,
      tiers: cleared.pricing.tiers?.filter((tier) => tier.id !== tierId),
    },
  };
}
