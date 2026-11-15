import {
  intervalSchema,
  layoutSchema,
  reservationPrice,
  type bookingSchema,
  type bookingPatchSchema,
  type EventPricing,
} from '@openvenue/contracts';
import type { z } from 'zod';
import type { Booking, Show, Venue } from '../database/entities';
import { fail } from '../../common/errors';

export type BookingRequest = z.infer<typeof bookingSchema>;

export function selectPlaces(
  venue: Venue,
  show: Show | null,
  request: BookingRequest,
  now = Date.now(),
) {
  if (venue.archived_at) fail(409, 'This venue is archived and cannot receive reservations.');
  const seatedEvent = venue.kind === 'cinema' || venue.kind === 'stadium';
  let times;
  let eventTitle: string | null = null;
  if (seatedEvent) {
    if (!request.showId) fail(400, 'Choose a showtime');
    if (!show) fail(400, 'Showtime not found');
    eventTitle = show.title;
    times = { start: show.starts_at.toISOString(), end: show.ends_at.toISOString() };
    if (
      (request.start !== undefined || request.end !== undefined) &&
      (Date.parse(request.start ?? '') !== +show.starts_at ||
        Date.parse(request.end ?? '') !== +show.ends_at)
    )
      fail(409, 'Event time changed. Review the updated schedule before confirming.');
  } else {
    if (request.showId) fail(400, 'Events are only available for cinemas and stadiums');
    times = intervalSchema.parse(request);
  }
  if (Date.parse(times.start) <= now) fail(400, 'Reservations must start in the future');
  const ids = request.resourceIds ?? [request.resourceId];
  if (ids[0] !== request.resourceId) fail(400, 'The first selected seat must match the resource');
  if (!seatedEvent && ids.length !== 1) fail(400, 'Choose one table or parking space');
  if (seatedEvent && ids.length !== request.partySize) fail(400, 'Choose one seat for each guest');
  if (venue.kind === 'parking' && request.partySize !== 1)
    fail(400, 'Reserve one parking space at a time');
  const layout = layoutSchema.parse(venue.layout);
  const resourcesById = new Map(
    layout.floors.flatMap((floor) => floor.resources).map((resource) => [resource.id, resource]),
  );
  const resources = ids.map((id) => {
    const resource = resourcesById.get(id);
    if (!resource) fail(404, 'Resource not found');
    if (venue.kind === 'restaurant' && resource.capacity < request.partySize)
      fail(400, 'Your party exceeds this table’s capacity');
    return resource;
  });
  return {
    times,
    eventTitle,
    layout,
    resources,
    partySize: venue.kind === 'restaurant' ? request.partySize : 1,
  };
}

export function priceSelection(
  selection: ReturnType<typeof selectPlaces>,
  request: BookingRequest,
  pricing?: EventPricing,
) {
  const places = selection.resources.map((resource) => ({
    resource,
    price: reservationPrice(selection.layout, resource, pricing),
  }));
  const total = places.reduce((sum, place) => sum + place.price, 0);
  if (
    (total > 0 || request.expectedTotal !== undefined) &&
    (request.expectedTotal !== total ||
      request.expectedCurrency !== selection.layout.pricing.currency)
  )
    fail(409, 'Prices changed. Review the updated total before confirming.');
  return places;
}

export function applyBookingUpdate(
  booking: Booking,
  patch: z.infer<typeof bookingPatchSchema>,
  checkedInAt: Date | null,
) {
  if (patch.checkedIn === true && booking.status !== 'confirmed')
    fail(409, 'Only confirmed reservations can be checked in');
  if (patch.status && booking.status !== 'confirmed' && patch.status !== booking.status)
    fail(409, 'This reservation already has a terminal status');
  const cancelled = booking.status === 'confirmed' && patch.status === 'cancelled';
  if (patch.notes !== undefined) booking.notes = patch.notes;
  if (patch.status !== undefined) booking.status = patch.status;
  if (booking.status !== 'confirmed' || patch.checkedIn === false) booking.checked_in_at = null;
  else if (patch.checkedIn === true) booking.checked_in_at = booking.checked_in_at ?? checkedInAt;
  return { cancelled };
}
