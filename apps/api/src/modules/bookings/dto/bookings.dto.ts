import {
  bookingSchema,
  bookingPatchSchema,
  bookingFiltersSchema,
  intervalSchema,
} from '@openvenue/contracts';
import { z } from 'zod';

export { bookingSchema, bookingPatchSchema, bookingFiltersSchema };
export const availabilityQuerySchema = intervalSchema.safeExtend({ showId: z.uuid().optional() });

export type CreateBookingDto = z.infer<typeof bookingSchema>;
export type UpdateBookingDto = z.infer<typeof bookingPatchSchema>;
export type BookingFiltersDto = z.infer<typeof bookingFiltersSchema>;
export type AvailabilityQueryDto = z.infer<typeof availabilityQuerySchema>;
