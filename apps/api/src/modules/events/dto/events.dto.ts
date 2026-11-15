import { eventPricingSchema, eventSchema } from '@openvenue/contracts';
import { z } from 'zod';

export { eventPricingSchema, eventSchema };
export type EventDto = z.infer<typeof eventSchema>;
export type EventPricingDto = z.infer<typeof eventPricingSchema>;

export const blockSeatsSchema = z.object({
  resourceIds: z
    .array(z.uuid().transform((id) => id.toLowerCase()))
    .min(1)
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length, 'Choose each seat only once'),
  reason: z.string().trim().min(1).max(240),
});

export const releaseSeatsSchema = blockSeatsSchema.omit({ reason: true });
export type BlockSeatsDto = z.infer<typeof blockSeatsSchema>;
export type ReleaseSeatsDto = z.infer<typeof releaseSeatsSchema>;
