import type { z } from 'zod';
import type { bookingSchema, Booking } from '@openvenue/contracts';
import { api, json } from '../api';

// Refresh stale event/price data before presenting the original checkout error for retry.
export async function reserveBooking(
  body: z.input<typeof bookingSchema>,
  refresh: () => Promise<void>,
) {
  try {
    return await api<Booking & { bookings?: Booking[] }>('/bookings', json(body));
  } catch (error) {
    await refresh();
    throw error;
  }
}
