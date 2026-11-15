import { z } from 'zod';

export type PublicBookingRoute = {
  venueId: string;
  showId?: string;
  embed: boolean;
  error?: string;
};
export function publicBookingRoute(
  location: Pick<Location, 'pathname' | 'search'>,
): PublicBookingRoute | undefined {
  if (!/^\/book(?:\/|$)/.test(location.pathname)) return;
  const match = location.pathname.match(/^\/book\/([^/]+)\/?$/);
  const query = new URLSearchParams(location.search);
  const venueId = match?.[1].toLowerCase() ?? '';
  const showId = query.has('show') ? query.get('show')!.toLowerCase() : undefined;
  return {
    venueId,
    showId,
    embed: query.get('embed') === '1',
    ...(!z.uuid().safeParse(venueId).success ||
    (showId !== undefined && !z.uuid().safeParse(showId).success)
      ? { error: 'This booking link is invalid.' }
      : {}),
  };
}
